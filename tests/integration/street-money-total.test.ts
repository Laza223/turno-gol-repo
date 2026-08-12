/**
 * B10 — el total de "plata en la calle" calculado en SQL tiene que dar
 * EXACTAMENTE lo mismo que sumar la lista.
 *
 * `getStreetMoneyTotal` existe para que `/caja` no materialice la lista entera
 * de deuda impaga solo para mostrar un número, y para lograrlo repite los
 * predicados de `getDebts`, `listOpenTabs` y `listTenantInscriptionDebts`. Esa
 * duplicación es el precio, y este archivo es lo que impide que se pague dos
 * veces: si alguien cambia un predicado de un lado y no del otro, acá se pone
 * rojo en vez de aparecer como dos números distintos en dos pantallas.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

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
import {
  getStreetMoney,
  getStreetMoneyTotal,
  sumStreetMoney,
} from '@/modules/cashflow/street-money.service'
import {
  DEFAULT_STREET_MONEY_WINDOW,
  type StreetMoneyWindow,
} from '@/modules/cashflow/street-money-window'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha B10'}, ${10},
      ${sql.json({
        rules: [
          {
            days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            from: '08:00',
            to: '23:00',
            price: 800000,
          },
        ],
      })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

/** Un turno jugado y NO cobrado: la primera fuente de deuda. */
async function insertCompletedBooking(
  tenantId: string,
  courtId: string,
  playerId: string,
  price: number,
  opts: { depositAmount?: number; depositStatus?: string; date?: string } = {},
): Promise<string> {
  const sql = getSql()
  const date = opts.date ?? '2030-02-04'
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at, type, status, price_snapshot,
      deposit_amount, deposit_status
    )
    VALUES (
      ${tenantId}, ${courtId}, ${playerId}, ${date}::date, '20:00'::time, '21:00'::time,
      ${`${date}T20:00:00-03:00`}::timestamptz, ${`${date}T21:00:00-03:00`}::timestamptz,
      'spontaneous', 'completed', ${price},
      ${opts.depositAmount ?? 0}, ${opts.depositStatus ?? 'not_required'}::deposit_status
    )
    RETURNING id
  `
  return rows[0]!.id
}

/** Un cobro parcial contra ese turno: deja deuda, no la borra. */
async function insertBookingCharge(
  tenantId: string,
  bookingId: string,
  amount: number,
  staffUserId: string,
): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO cash_flows (
      tenant_id, booking_id, type, category, method, amount, description,
      occurred_at, registered_by
    )
    VALUES (
      ${tenantId}, ${bookingId}, 'income', 'booking', 'cash', ${amount},
      ${'Cobro parcial'}, NOW(), ${staffUserId}
    )
  `
}

/** Un fiado de cantina abierto: la segunda fuente. `created_by` es NOT NULL. */
async function insertOpenTab(tenantId: string, amount: number, staffUserId: string): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO canteen_tabs (tenant_id, debtor_name, total_amount, status, created_by)
    VALUES (${tenantId}, ${'Fiado de prueba'}, ${amount}, 'open', ${staffUserId})
  `
}

/** Staff del complejo — lo exige `canteen_tabs.created_by`. */
async function staffFor(tenantId: string): Promise<string> {
  const sql = getSql()
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenantId, staff.id)
  return staff.id
}

const both = (tenantId: string) =>
  withTenantContext(tenantId, async (tx) => {
    const rows = await getStreetMoney(tenantId, tx)
    const total = await getStreetMoneyTotal(tenantId, tx)
    return { desdeLaLista: sumStreetMoney(rows), desdeSql: total, filas: rows.length }
  })

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('getStreetMoneyTotal — el número de SQL y el de la lista no pueden diferir', () => {
  it('da 0 y 0 cuando el complejo no debe nada', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    const { desdeLaLista, desdeSql } = await both(tenant.id)

    expect(desdeSql.totalCents).toBe(0)
    expect(desdeSql.count).toBe(0)
    expect(desdeLaLista).toBe(0)
  })

  it('coincide con un turno jugado sin cobrar', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await insertCompletedBooking(tenant.id, courtId, player.id, 800000)

    const { desdeLaLista, desdeSql, filas } = await both(tenant.id)

    expect(desdeSql.totalCents).toBe(800000)
    expect(desdeSql.count).toBe(filas)
    expect(desdeSql.totalCents).toBe(desdeLaLista)
  })

  it('coincide descontando la seña pagada y los cobros parciales', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)

    // 800.000 con seña de 200.000 ya pagada y un cobro parcial de 100.000:
    // quedan 500.000 en la calle. Es el caso donde un predicado copiado a medias
    // se nota.
    const bookingId = await insertCompletedBooking(tenant.id, courtId, player.id, 800000, {
      depositAmount: 200000,
      depositStatus: 'paid',
    })
    await insertBookingCharge(tenant.id, bookingId, 100000, await staffFor(tenant.id))

    const { desdeLaLista, desdeSql } = await both(tenant.id)

    expect(desdeSql.totalCents).toBe(500000)
    expect(desdeSql.totalCents).toBe(desdeLaLista)
  })

  it('coincide sumando las tres fuentes a la vez', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)

    await insertCompletedBooking(tenant.id, courtId, player.id, 800000)
    await insertCompletedBooking(tenant.id, courtId, player.id, 500000, { date: '2030-02-05' })
    const staffId = await staffFor(tenant.id)
    await insertOpenTab(tenant.id, 35000, staffId)
    await insertOpenTab(tenant.id, 15000, staffId)

    const { desdeLaLista, desdeSql, filas } = await both(tenant.id)

    expect(desdeSql.totalCents).toBe(800000 + 500000 + 35000 + 15000)
    expect(desdeSql.count).toBe(filas)
    expect(desdeSql.totalCents).toBe(desdeLaLista)
  })

  it('ignora un turno ya cobrado por completo, igual que la lista', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)

    const bookingId = await insertCompletedBooking(tenant.id, courtId, player.id, 800000)
    await insertBookingCharge(tenant.id, bookingId, 800000, await staffFor(tenant.id))

    const { desdeLaLista, desdeSql, filas } = await both(tenant.id)

    expect(filas).toBe(0)
    expect(desdeSql.totalCents).toBe(0)
    expect(desdeSql.count).toBe(0)
    expect(desdeLaLista).toBe(0)
  })

  it('no cuenta la deuda de otro complejo', async () => {
    const sql = getSql()
    const a = await createTestTenant(sql)
    const b = await createTestTenant(sql)
    const courtB = await insertCourt(b.id)
    const player = await createTestPlayer(sql)
    await insertCompletedBooking(b.id, courtB, player.id, 800000)
    await insertOpenTab(b.id, 50000, await staffFor(b.id))

    const totalA = await both(a.id)
    const totalB = await both(b.id)

    expect(totalA.desdeSql.totalCents).toBe(0)
    expect(totalB.desdeSql.totalCents).toBe(850000)
    expect(totalB.desdeSql.totalCents).toBe(totalB.desdeLaLista)
  })
})

/**
 * B11 — la ventana de 12 meses. Acota la CONSULTA, no la deuda: la fila vieja
 * sigue existiendo y `'all'` la trae.
 *
 * Lo que estos casos protegen es que la ventana llegue a los TRES orígenes por
 * las DOS rutas. Aplicarla solo en la lista (y no en el total) dejaría el
 * encabezado de /caja diciendo un número y /caja/deudas mostrando otro — que es
 * el mismo agujero que este archivo viene tapando desde B10, ahora con un
 * parámetro más por donde se puede escapar.
 */
describe('ventana de 12 meses (B11)', () => {
  /** Fecha ART de hace `months` meses, en YYYY-MM-DD. */
  const monthsAgo = (months: number): string => {
    const d = new Date()
    d.setUTCMonth(d.getUTCMonth() - months)
    return d.toISOString().slice(0, 10)
  }

  const withWindow = (tenantId: string, window: StreetMoneyWindow) =>
    withTenantContext(tenantId, async (tx) => {
      const rows = await getStreetMoney(tenantId, tx, window)
      const total = await getStreetMoneyTotal(tenantId, tx, window)
      return { desdeLaLista: sumStreetMoney(rows), desdeSql: total, filas: rows.length }
    })

  it('una deuda de hace 18 meses queda FUERA por defecto y aparece con "all"', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await insertCompletedBooking(tenant.id, courtId, player.id, 800000, {
      date: monthsAgo(18),
    })

    const porDefecto = await withWindow(tenant.id, DEFAULT_STREET_MONEY_WINDOW)
    expect(porDefecto.filas).toBe(0)
    expect(porDefecto.desdeSql.totalCents).toBe(0)

    const todas = await withWindow(tenant.id, 'all')
    expect(todas.filas).toBe(1)
    expect(todas.desdeSql.totalCents).toBe(800000)
  })

  it('una deuda de hace 3 meses entra en las dos ventanas', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await insertCompletedBooking(tenant.id, courtId, player.id, 500000, { date: monthsAgo(3) })

    expect((await withWindow(tenant.id, DEFAULT_STREET_MONEY_WINDOW)).desdeSql.totalCents).toBe(
      500000,
    )
    expect((await withWindow(tenant.id, 'all')).desdeSql.totalCents).toBe(500000)
  })

  it('la lista y el total coinciden en LAS DOS ventanas, con deuda vieja y nueva mezcladas', async () => {
    // El caso que de verdad importa: si la ventana llegara a una ruta y no a la
    // otra, acá los dos números se separan.
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await insertCompletedBooking(tenant.id, courtId, player.id, 800000, { date: monthsAgo(20) })
    await insertCompletedBooking(tenant.id, courtId, player.id, 300000, { date: monthsAgo(2) })

    const porDefecto = await withWindow(tenant.id, DEFAULT_STREET_MONEY_WINDOW)
    expect(porDefecto.desdeSql.totalCents).toBe(porDefecto.desdeLaLista)
    expect(porDefecto.desdeSql.totalCents).toBe(300000)

    const todas = await withWindow(tenant.id, 'all')
    expect(todas.desdeSql.totalCents).toBe(todas.desdeLaLista)
    expect(todas.desdeSql.totalCents).toBe(1_100_000)
  })

  it('un fiado de cantina viejo también respeta la ventana (los 3 orígenes, no solo turnos)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staffId = await staffFor(tenant.id)
    await insertOpenTab(tenant.id, 45000, staffId)
    // El helper inserta con NOW(); lo envejecemos para cruzar la ventana.
    await sql`
      UPDATE canteen_tabs SET created_at = NOW() - INTERVAL '20 months'
      WHERE tenant_id = ${tenant.id}
    `

    expect((await withWindow(tenant.id, DEFAULT_STREET_MONEY_WINDOW)).desdeSql.totalCents).toBe(0)

    const todas = await withWindow(tenant.id, 'all')
    expect(todas.desdeSql.totalCents).toBe(45000)
    expect(todas.desdeSql.totalCents).toBe(todas.desdeLaLista)
  })
})
