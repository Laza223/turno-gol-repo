import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { createProduct } from '@/modules/canteen/canteen.service'
import {
  cancelTab,
  createTab,
  listOpenTabsForBooking,
  settleTab,
} from '@/modules/canteen/canteen-tab.service'
import {
  InsufficientStockError,
  SaleBookingNotFoundError,
  TabBookingInvalidError,
  TabNotOpenError,
} from '@/modules/canteen/canteen.errors'

/**
 * Consumos anotados al turno (migr. 116, docs/decisions/2026-11-17-consumos-anotados-
 * al-turno.md): un fiado con `booking_id`. Se anota sin tocar la caja, se cobra con
 * `settleTab` junto con la cancha y nunca cuenta como pago del turno.
 */

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

/** Cancha + turno crudos (mismo patrón que reconciliation-drift.test.ts). */
async function createCourtAndBooking(
  tenantId: string,
  opts: { courtName?: string; status?: string; timeStart?: string; type?: string } = {},
): Promise<string> {
  const sql = getSql()
  const timeStart = opts.timeStart ?? '21:00'
  const player = await createTestPlayer(sql)
  const [{ courtId }] = await sql<{ courtId: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${opts.courtName ?? 'Cancha 3'}, 10, ${sql.json(PRICING)}, 'online')
    RETURNING id AS "courtId"
  `
  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, status, type
    )
    VALUES (
      ${tenantId}, ${courtId}, ${player.id},
      '2027-08-20'::date, ${timeStart}::time, (${timeStart}::time + interval '1 hour'),
      ('2027-08-20'::date + ${timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ('2027-08-20'::date + ${timeStart}::time + interval '1 hour') AT TIME ZONE 'America/Argentina/Buenos_Aires',
      2000000, 240000, 'paid', ${opts.status ?? 'confirmed'}, ${opts.type ?? 'spontaneous'}
    )
    RETURNING id
  `
  return id
}

async function count(table: 'cash_flows' | 'canteen_tabs' | 'stock_movements', tenantId: string) {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM ${sql(table)} WHERE tenant_id = ${tenantId}
  `
  return rows[0]!.n
}

async function stockOf(productId: string): Promise<number | null> {
  const sql = getSql()
  const rows = await sql<{ stock: number | null }[]>`
    SELECT stock FROM canteen_products WHERE id = ${productId}
  `
  return rows[0]!.stock
}

describe('consumo anotado a un turno', () => {
  it('anota al turno: guarda booking_id, arma el nombre en el servidor, no toca la caja y lo lista con sus ítems', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const bookingId = await createCourtAndBooking(tenant.id)
    const birra = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Birra', price: 250000, stock: 10 }, tx),
    )
    const agua = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Agua', price: 100000, stock: 5 }, tx),
    )

    const { tab, duplicate } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          // Lo que mande el cliente como nombre se ignora: sale del turno.
          debtorName: 'Nombre que manda el cliente',
          bookingId,
          lines: [
            { productId: birra.id, qty: 2 },
            { productId: agua.id, qty: 1 },
          ],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    expect(duplicate).toBe(false)
    expect(tab.bookingId).toBe(bookingId)
    expect(tab.debtorName).toBe('Consumo de turno · Cancha 3 · 21:00')
    expect(tab.totalAmount).toBe(250000 * 2 + 100000)
    // Anotar NO es cobrar: el stock sale, la caja no se toca.
    expect(await count('cash_flows', tenant.id)).toBe(0)
    expect(await stockOf(birra.id)).toBe(8)
    expect(await stockOf(agua.id)).toBe(4)

    const consumos = await withTenantContext(tenant.id, (tx) =>
      listOpenTabsForBooking(tenant.id, bookingId, tx),
    )
    expect(consumos).toHaveLength(1)
    expect(consumos[0]!.tabId).toBe(tab.id)
    expect(consumos[0]!.totalAmount).toBe(600000)
    expect(consumos[0]!.items).toEqual(
      expect.arrayContaining([
        { name: 'Birra', qty: 2 },
        { name: 'Agua', qty: 1 },
      ]),
    )
  })

  it('anotar dos veces con la misma key no descuenta el stock dos veces', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const bookingId = await createCourtAndBooking(tenant.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Jugo', price: 200000, stock: 10 }, tx),
    )
    const input = {
      bookingId,
      lines: [{ productId: product.id, qty: 2 }],
      clientIdempotencyKey: crypto.randomUUID(),
    }

    const first = await withTenantContext(tenant.id, (tx) =>
      createTab(tenant.id, staff.id, input, tx),
    )
    const second = await withTenantContext(tenant.id, (tx) =>
      createTab(tenant.id, staff.id, input, tx),
    )

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.tab.id).toBe(first.tab.id)
    expect(await count('canteen_tabs', tenant.id)).toBe(1)
    expect(await stockOf(product.id)).toBe(8) // 10 - 2, nunca 10 - 4
  })

  it('saldarlo entra como "Consumo de turno" (product_sale, sin booking_id), no cuenta como pago del turno y sale de la lista; repetirlo es idempotente', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const bookingId = await createCourtAndBooking(tenant.id, { courtName: 'Cancha 5' })
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Gatorade', price: 300000, stock: 6 }, tx),
    )
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          bookingId,
          lines: [{ productId: product.id, qty: 2 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    const settleKey = crypto.randomUUID()
    const settle = () =>
      withTenantContext(tenant.id, (tx) =>
        settleTab(
          tenant.id,
          staff.id,
          {
            tabId: tab.id,
            charges: [{ amount: tab.totalAmount, method: 'transfer' }],
            clientIdempotencyKey: settleKey,
          },
          tx,
        ),
      )
    const first = await settle()
    const second = await settle() // reintento de red con la MISMA key

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(await count('cash_flows', tenant.id)).toBe(1)

    const rows = await sql<
      Array<{ category: string; amount: number; description: string; booking_id: string | null }>
    >`
      SELECT category, amount, description, booking_id FROM cash_flows WHERE tenant_id = ${tenant.id}
    `
    // 'product_sale' y sin booking_id: lo que calcula el saldo del turno filtra
    // category = 'booking', así que un consumo cobrado nunca baja lo que se debe de la cancha.
    expect(rows[0]).toEqual({
      category: 'product_sale',
      amount: 600000,
      description: 'Consumo de turno · Cancha 5 · 21:00',
      booking_id: null,
    })

    const consumos = await withTenantContext(tenant.id, (tx) =>
      listOpenTabsForBooking(tenant.id, bookingId, tx),
    )
    expect(consumos).toEqual([])
  })

  it('un turno de OTRO complejo se rechaza y no persiste nada', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const staffA = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantA.id, staffA.id)
    const foreignBookingId = await createCourtAndBooking(tenantB.id)
    const product = await withTenantContext(tenantA.id, (tx) =>
      createProduct(tenantA.id, { name: 'Agua', price: 100000, stock: 5 }, tx),
    )

    await expect(
      withTenantContext(tenantA.id, (tx) =>
        createTab(
          tenantA.id,
          staffA.id,
          {
            bookingId: foreignBookingId,
            lines: [{ productId: product.id, qty: 1 }],
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(SaleBookingNotFoundError)

    expect(await count('canteen_tabs', tenantA.id)).toBe(0)
    expect(await count('stock_movements', tenantA.id)).toBe(0)
    expect(await stockOf(product.id)).toBe(5)
  })

  it('un turno que todavía no está confirmado no admite consumos y no persiste nada', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const bookingId = await createCourtAndBooking(tenant.id, { status: 'pending_payment' })
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Agua', price: 100000, stock: 5 }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createTab(
          tenant.id,
          staff.id,
          {
            bookingId,
            lines: [{ productId: product.id, qty: 1 }],
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(TabBookingInvalidError)

    expect(await count('canteen_tabs', tenant.id)).toBe(0)
    expect(await stockOf(product.id)).toBe(5)
  })

  it.each([
    ['cancelado con devolución', { status: 'canceled_refunded' }],
    ['cancelado sin devolución', { status: 'canceled_no_refund' }],
    ['ausente', { status: 'no_show' }],
    ['un bloqueo', { type: 'block' }],
    ['un torneo', { type: 'tournament' }],
  ])('no se anota a un turno %s', async (_label, opts) => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const bookingId = await createCourtAndBooking(tenant.id, opts)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Agua', price: 100000, stock: 5 }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createTab(
          tenant.id,
          staff.id,
          {
            bookingId,
            lines: [{ productId: product.id, qty: 1 }],
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(TabBookingInvalidError)

    expect(await count('canteen_tabs', tenant.id)).toBe(0)
    expect(await stockOf(product.id)).toBe(5)
  })

  it('con stock insuficiente no queda ni la cuenta ni el movimiento de stock', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const bookingId = await createCourtAndBooking(tenant.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Birra', price: 250000, stock: 1 }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createTab(
          tenant.id,
          staff.id,
          {
            bookingId,
            lines: [{ productId: product.id, qty: 2 }],
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError)

    expect(await count('canteen_tabs', tenant.id)).toBe(0)
    expect(await count('stock_movements', tenant.id)).toBe(0)
    expect(await stockOf(product.id)).toBe(1)
  })

  it('quitar un anotado devuelve el stock una sola vez y ya no se puede cobrar', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const bookingId = await createCourtAndBooking(tenant.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Birra', price: 250000, stock: 10 }, tx),
    )
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          bookingId,
          lines: [{ productId: product.id, qty: 3 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )
    expect(await stockOf(product.id)).toBe(7)

    const quitar = () =>
      withTenantContext(tenant.id, (tx) =>
        cancelTab(
          tenant.id,
          staff.id,
          { tabId: tab.id, reason: 'Se quitó del turno al cobrar' },
          tx,
        ),
      )
    await quitar()
    expect(await stockOf(product.id)).toBe(10)

    // Un segundo "quitar" (doble click, otro dispositivo) no devuelve de nuevo.
    await expect(quitar()).rejects.toBeInstanceOf(TabNotOpenError)
    expect(await stockOf(product.id)).toBe(10)

    // Y un anotado quitado no se puede cobrar: el cobro de "todo junto" falla antes de tocar el turno.
    await expect(
      withTenantContext(tenant.id, (tx) =>
        settleTab(
          tenant.id,
          staff.id,
          {
            tabId: tab.id,
            charges: [{ amount: tab.totalAmount, method: 'cash' }],
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(TabNotOpenError)
    expect(await count('cash_flows', tenant.id)).toBe(0)
  })

  it('listOpenTabsForBooking junta las tandas del turno en orden, deja afuera las anuladas y no mezcla turnos ni complejos', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const other = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const bookingId = await createCourtAndBooking(tenant.id)
    const otherBookingId = await createCourtAndBooking(tenant.id, {
      courtName: 'Cancha 9',
      timeStart: '22:00',
    })
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Papas', price: 100000, stock: 20 }, tx),
    )
    const note = (target: string, qty: number) =>
      withTenantContext(tenant.id, (tx) =>
        createTab(
          tenant.id,
          staff.id,
          {
            bookingId: target,
            lines: [{ productId: product.id, qty }],
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      )

    const { tab: first } = await note(bookingId, 1)
    const { tab: anulada } = await note(bookingId, 2)
    const { tab: third } = await note(bookingId, 3)
    await note(otherBookingId, 4)
    await withTenantContext(tenant.id, (tx) =>
      cancelTab(tenant.id, staff.id, { tabId: anulada.id, reason: 'Anotado por error' }, tx),
    )

    const consumos = await withTenantContext(tenant.id, (tx) =>
      listOpenTabsForBooking(tenant.id, bookingId, tx),
    )
    expect(consumos.map((c) => c.tabId)).toEqual([first.id, third.id])
    expect(consumos.map((c) => c.items[0]!.qty)).toEqual([1, 3])

    // Pedirlo con el tenant equivocado no trae nada (filtro explícito por tenant_id).
    expect(
      await withTenantContext(other.id, (tx) => listOpenTabsForBooking(other.id, bookingId, tx)),
    ).toEqual([])
  })
})
