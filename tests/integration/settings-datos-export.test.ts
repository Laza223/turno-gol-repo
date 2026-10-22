import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { closeSql, getDb, getSql, withTenantContext, type DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import {
  depositCashFlowDescription,
  summarizeBookingCharges,
} from '@/modules/bookings/booking.charges'
import { getBookingCharges } from '@/app/(admin)/reservas/queries'
import {
  BOOKINGS_EXPORT_PAGE_SIZE,
  listAbonadosForExport,
  listBookingsForExport,
  listClientsForExport,
} from '@/app/(admin)/settings/datos/queries'
import { parseBookingsCursor } from '@/app/(admin)/settings/datos/datos.schema'
import {
  asApp,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * Lecturas del export de datos (`/settings/datos`, spec 2026-10-22 §8).
 *
 * Seeds con el superusuario; las lecturas corren con el ROL DE LA APP y el
 * tenant seteado, como en producción: si RLS o un GRANT dejaran algo afuera,
 * el archivo saldría corto sin ningún error, y acá se pone rojo.
 *
 * Sin `cleanupAll` ni TRUNCATE: cada caso arma sus propios complejos y el
 * `afterAll` borra solo lo que sembró este archivo.
 */

/** Lo que sembró este archivo: es lo único que el `afterAll` borra. */
const seeded = { tenants: [] as string[], staff: [] as string[], players: [] as string[] }

async function newTenant(): Promise<string> {
  const { id } = await createTestTenant(getSql())
  seeded.tenants.push(id)
  return id
}

async function newStaff(): Promise<{ id: string }> {
  const staff = await createTestStaffUser(getSql())
  seeded.staff.push(staff.id)
  return staff
}

async function insertPlayer(firstName: string, lastName: string, phone: string): Promise<string> {
  const rows = await getSql()<{ id: string }[]>`
    INSERT INTO players (email, first_name, last_name, phone, agreed_to_terms_at, terms_version)
    VALUES (
      ${`export-${crypto.randomUUID()}@test.local`}, ${firstName}, ${lastName}, ${phone}, NOW(), 'v1'
    )
    RETURNING id
  `
  seeded.players.push(rows[0]!.id)
  return rows[0]!.id
}

/** Drizzle bajo `turnogol_app` + tenant: lo mismo que `withTenantContext` en prod. */
function asAppDb<T>(tenantId: string, fn: (tx: DbTx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(drizzleSql`SET LOCAL ROLE turnogol_app`)
    await tx.execute(drizzleSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`)
    return fn(tx)
  })
}

async function insertCourt(tenantId: string, name: string): Promise<string> {
  const rows = await getSql()<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, status)
    VALUES (${tenantId}, ${name}, ${10}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

/** Una reserva jugada de 20 a 21 en `date`, por cada cancha. Devuelve los ids. */
async function insertPlayedBookings(
  tenantId: string,
  courtIds: string[],
  from: string,
  days: number,
): Promise<string[]> {
  const rows = await getSql()<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, guest_name, date, time_start, time_end,
      starts_at, ends_at, price_snapshot, deposit_amount, deposit_status,
      payment_method, status
    )
    SELECT ${tenantId}, c.id, 'Invitado', d::date, '20:00'::time, '21:00'::time,
           (d::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
           (d::date + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
           4500000, 0, 'not_required', NULL, 'completed'
    FROM generate_series(${from}::date, ${from}::date + ${days - 1}::int, interval '1 day') d
    CROSS JOIN unnest(${courtIds}::uuid[]) AS c(id)
    RETURNING id
  `
  return rows.map((r) => r.id)
}

async function insertAbonado(opts: {
  tenantId: string
  courtId: string
  name: string
  phone: string
  dayOfWeek: number
  status: 'active' | 'paused' | 'canceled'
}): Promise<void> {
  await getSql()`
    INSERT INTO abonados (
      tenant_id, court_id, contact_name, contact_phone, day_of_week,
      time_start, time_end, price_per_session, starts_on, status, payment_method
    ) VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.name}, ${opts.phone}, ${opts.dayOfWeek},
      '21:00', '22:00', 4000000, '2026-03-02', ${opts.status}, 'cash'
    )
  `
}

beforeAll(async () => {
  await ensureRoles(getSql())
}, 40_000)

afterAll(async () => {
  const sql = getSql()
  const { tenants, staff, players } = seeded
  try {
    // Hijos antes que padres. `audit_logs` la escribe el export y también
    // `createCashFlow`.
    for (const table of [
      'audit_logs',
      'cash_flows',
      'bookings',
      'abonados',
      'courts',
      'player_tenant_relationships',
      'tenant_staff_members',
    ]) {
      await sql`DELETE FROM ${sql(table)} WHERE tenant_id = ANY(${tenants}::uuid[])`
    }
    await sql`DELETE FROM tenants WHERE id = ANY(${tenants}::uuid[])`
    await sql`DELETE FROM staff_users WHERE id = ANY(${staff}::uuid[])`
    await sql`DELETE FROM players WHERE id = ANY(${players}::uuid[])`
  } finally {
    await closeSql()
  }
}, 60_000)

describe('listBookingsForExport — keyset', () => {
  let tenantId: string
  let otherTenantId: string
  let seeded: string[]
  let otherBookingId: string

  beforeAll(async () => {
    tenantId = await newTenant()
    otherTenantId = await newTenant()
    const courts = [
      await insertCourt(tenantId, 'Cancha 1'),
      await insertCourt(tenantId, 'Cancha 2'),
    ]
    // Una suelta antes de todo corre los pares un lugar: la página de 2.000
    // termina partiendo un empate de `starts_at` entre las dos canchas, que es
    // justo el borde donde un cursor solo por instante perdería una fila.
    const first = await insertPlayedBookings(tenantId, courts.slice(0, 1), '2022-12-31', 1)
    const pairs = await insertPlayedBookings(tenantId, courts, '2023-01-01', 1001)
    seeded = [...first, ...pairs]
    const otherCourt = await insertCourt(otherTenantId, 'Cancha del otro')
    ;[otherBookingId] = await insertPlayedBookings(otherTenantId, [otherCourt], '2023-06-01', 1)
  }, 60_000)

  it('dos páginas cubren todas las reservas, cada una una sola vez', async () => {
    expect(seeded).toHaveLength(BOOKINGS_EXPORT_PAGE_SIZE + 3)

    const page1 = await asAppDb(tenantId, (tx) => listBookingsForExport(tenantId, null, tx))
    expect(page1.rows).toHaveLength(BOOKINGS_EXPORT_PAGE_SIZE)
    const after = parseBookingsCursor(page1.nextCursor ?? '')
    expect(after).not.toBeNull()

    const page2 = await asAppDb(tenantId, (tx) => listBookingsForExport(tenantId, after, tx))
    expect(page2.rows).toHaveLength(3)
    expect(page2.nextCursor).toBeNull()

    // El borde cae adentro de un empate: misma fecha y hora a los dos lados.
    const [lastOf1, firstOf2] = [page1.rows.at(-1)!, page2.rows[0]!]
    expect([firstOf2.date, firstOf2.timeStart]).toEqual([lastOf1.date, lastOf1.timeStart])

    const ids = [...page1.rows, ...page2.rows].map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ids)).toEqual(new Set(seeded))
    expect(ids).not.toContain(otherBookingId)
  }, 60_000)

  it('una reserva que entra entre página y página no repite ni corre filas', async () => {
    const page1 = await asAppDb(tenantId, (tx) => listBookingsForExport(tenantId, null, tx))
    const courtId = await insertCourt(tenantId, 'Cancha 3')
    const [late] = await insertPlayedBookings(tenantId, [courtId], '2022-01-01', 1)
    try {
      const after = parseBookingsCursor(page1.nextCursor!)
      const page2 = await asAppDb(tenantId, (tx) => listBookingsForExport(tenantId, after, tx))
      expect(page2.rows).toHaveLength(3)
      expect(page2.rows.map((r) => r.id)).not.toContain(late)
      expect(page1.rows.map((r) => r.id)).not.toContain(page2.rows[0]!.id)
    } finally {
      await getSql()`DELETE FROM bookings WHERE id = ${late!}`
    }
  }, 60_000)

  it('con el contexto de otro complejo no ve nada, aunque pida el id del primero', async () => {
    const page = await asAppDb(otherTenantId, (tx) => listBookingsForExport(tenantId, null, tx))
    expect(page.rows).toEqual([])
    expect(page.nextCursor).toBeNull()
  }, 30_000)
})

describe('listBookingsForExport — lo cobrado', () => {
  it('"Cobrado" es lo mismo que muestra /reservas: seña pagada más mostrador, sin contar la seña dos veces', async () => {
    const tenantId = await newTenant()
    const staff = await newStaff()
    await linkStaffToTenant(getSql(), tenantId, staff.id)
    const courtId = await insertCourt(tenantId, 'Cancha 1')
    const [bookingId] = await getSql()<{ id: string }[]>`
      INSERT INTO bookings (
        tenant_id, court_id, guest_name, guest_phone, date, time_start, time_end,
        starts_at, ends_at, price_snapshot, deposit_amount, deposit_status,
        payment_method, status
      ) VALUES (
        ${tenantId}, ${courtId}, 'Juan', '1123456789', '2026-10-05', '20:00', '21:00',
        ('2026-10-05'::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        ('2026-10-05'::date + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        4500000, 1350000, 'paid', 'transfer', 'completed'
      )
      RETURNING id
    `.then((rows) => rows.map((r) => r.id))
    const charge = (amount: number, description: string) =>
      withTenantContext(tenantId, (tx) =>
        createCashFlow(
          tenantId,
          staff.id,
          { type: 'income', category: 'booking', amount, method: 'cash', description, bookingId },
          tx,
        ),
      )
    await charge(1350000, depositCashFlowDescription(bookingId!))
    await charge(3150000, 'Resto en el mostrador')

    const [page, detail] = await asAppDb(tenantId, async (tx) => [
      await listBookingsForExport(tenantId, null, tx),
      await getBookingCharges(tenantId, bookingId!, tx),
    ])
    const row = page.rows.find((r) => r.id === bookingId)!
    expect(row).toMatchObject({ clientName: 'Juan', phone: '1123456789', courtName: 'Cancha 1' })
    expect(row.totalPaid).toBe(4500000)
    expect(row.totalPaid).toBe(
      summarizeBookingCharges({
        priceSnapshot: 4500000,
        depositAmount: 1350000,
        depositStatus: 'paid',
        chargesTotal: detail.chargesTotal,
      }).totalPaid,
    )
  }, 60_000)
})

describe('listBookingsForExport — cliente y teléfono', () => {
  it('el jugador con cuenta sale con su nombre y teléfono; el anonimizado, sin nada', async () => {
    const tenantId = await newTenant()
    const courtId = await insertCourt(tenantId, 'Cancha 1')
    const ana = await insertPlayer('Ana', 'Gómez', '1144440000')
    const beto = await insertPlayer('Beto', 'Pérez', '1133330000')
    // La relación es la que deja ver al jugador bajo RLS
    // (`staff_can_see_related_players`): sin ella el nombre saldría vacío.
    for (const playerId of [ana, beto]) await linkPlayerToTenant(getSql(), tenantId, playerId)
    // Reserva online: sin invitado, nombre y teléfono salen de `players`
    // (`booking.service.ts` no guarda `guest_phone` si hay jugador).
    const bookingOf = async (playerId: string, date: string) => {
      const rows = await getSql()<{ id: string }[]>`
        INSERT INTO bookings (
          tenant_id, court_id, player_id, date, time_start, time_end,
          starts_at, ends_at, price_snapshot, deposit_amount, deposit_status, status
        ) VALUES (
          ${tenantId}, ${courtId}, ${playerId}, ${date}, '20:00', '21:00',
          (${date}::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
          (${date}::date + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
          4500000, 0, 'not_required', 'completed'
        )
        RETURNING id
      `
      return rows[0]!.id
    }
    const anaBooking = await bookingOf(ana, '2026-10-05')
    const betoBooking = await bookingOf(beto, '2026-10-06')
    // Lo que deja `anonymizePlayer` (pasos 1, 3 y 5 de player.anonymization.ts),
    // sembrado a mano: el módulo ARCO no se llama ni se toca desde acá.
    await getSql()`
      UPDATE players
      SET status = 'anonymized', email = 'anon-' || id || '@anon.local',
          first_name = '[eliminado]', last_name = '[eliminado]', phone = NULL
      WHERE id = ${beto}
    `
    await getSql()`DELETE FROM player_tenant_relationships WHERE player_id = ${beto}`
    await getSql()`UPDATE bookings SET player_id = NULL WHERE player_id = ${beto}`

    const page = await asAppDb(tenantId, (tx) => listBookingsForExport(tenantId, null, tx))
    const byId = new Map(page.rows.map((r) => [r.id, r]))
    expect(byId.get(anaBooking)).toMatchObject({ clientName: 'Ana Gómez', phone: '1144440000' })
    expect(byId.get(betoBooking)).toMatchObject({ clientName: null, phone: null })
    expect(JSON.stringify(page.rows)).not.toMatch(/Beto|Pérez|1133330000|eliminado/)
  }, 60_000)
})

describe('auditoría del export', () => {
  it('el rol de la app puede dejar la fila en audit_logs', async () => {
    const tenantId = await newTenant()
    const staff = await newStaff()
    await asAppDb(tenantId, (tx) =>
      insertAuditLog(tx, {
        tenantId,
        actorId: staff.id,
        actorType: 'staff',
        action: 'tenant.data_exported',
        resourceType: 'tenant',
        resourceId: tenantId,
        metadata: { dataset: 'clients', rows: 0 },
      }),
    )
    const rows = await asApp(
      tenantId,
      (tx) => tx<{ actor_id: string; metadata: unknown }[]>`
        SELECT actor_id, metadata FROM audit_logs
        WHERE tenant_id = ${tenantId} AND action = 'tenant.data_exported'
      `,
    )
    expect(rows).toEqual([{ actor_id: staff.id, metadata: { dataset: 'clients', rows: 0 } }])
  }, 30_000)
})

describe('turnos fijos y clientes', () => {
  let tenantId: string
  const PLAYERS = 51

  beforeAll(async () => {
    tenantId = await newTenant()
    const otherTenantId = await newTenant()
    const courtId = await insertCourt(tenantId, 'Cancha F5')
    // Más jugadores vinculados que una página de /jugadores (50).
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const linked = await getSql()<{ player_id: string }[]>`
      WITH p AS (
        INSERT INTO players (email, first_name, last_name, agreed_to_terms_at, terms_version)
        SELECT 'export-' || g || '-' || ${tag} || '@test.local', 'Jugador', g::text, NOW(), 'v1'
        FROM generate_series(1, ${PLAYERS}) g
        RETURNING id
      )
      INSERT INTO player_tenant_relationships (tenant_id, player_id)
      SELECT ${tenantId}, id FROM p
      RETURNING player_id
    `
    seeded.players.push(...linked.map((r) => r.player_id))
    // Tres fijos de la misma persona sin cuenta, en los tres estados: en
    // /jugadores es UNA persona (mismo teléfono), en el export son tres filas.
    for (const [dayOfWeek, status] of [
      [1, 'active'],
      [2, 'paused'],
      [3, 'canceled'],
    ] as const) {
      await insertAbonado({
        tenantId,
        courtId,
        name: 'Diego Fijo',
        phone: '1155550000',
        dayOfWeek,
        status,
      })
    }
    await insertAbonado({
      tenantId: otherTenantId,
      courtId: await insertCourt(otherTenantId, 'Cancha ajena'),
      name: 'De otro complejo',
      phone: '1166660000',
      dayOfWeek: 1,
      status: 'active',
    })
  }, 60_000)

  it('turnos fijos: todos los estados, con el nombre de la cancha, y nada de otro complejo', async () => {
    const rows = await asAppDb(tenantId, (tx) => listAbonadosForExport(tenantId, tx))
    expect(rows.map((r) => r.status).sort()).toEqual(['active', 'canceled', 'paused'])
    expect(new Set(rows.map((r) => r.courtName))).toEqual(new Set(['Cancha F5']))
    expect(rows.map((r) => r.contactName)).not.toContain('De otro complejo')
  }, 30_000)

  it('clientes: recorre todas las páginas de /jugadores y suma la persona sin cuenta', async () => {
    const rows = await asAppDb(tenantId, (tx) => listClientsForExport(tenantId, tx))
    expect(rows).toHaveLength(PLAYERS + 1)
    expect(rows.filter((r) => r.kind === 'player')).toHaveLength(PLAYERS)
    expect(rows.find((r) => r.kind === 'contact')).toMatchObject({
      name: 'Diego Fijo',
      phone: '1155550000',
      email: null,
    })
  }, 30_000)
})
