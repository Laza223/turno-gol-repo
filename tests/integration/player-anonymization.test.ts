import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  anonymizePlayer,
  PlayerAlreadyAnonymizedError,
  PlayerNotFoundError,
} from '@/modules/players/player.anonymization'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  createTestStaffUser,
  linkPlayerToTenant,
  linkStaffToTenant,
  ensureRoles,
} from '../helpers/tenant'

let sql: ReturnType<typeof getSql>

beforeAll(async () => {
  sql = getSql()
  await ensureRoles(sql)
})
beforeEach(async () => { await cleanupAll(sql) })
afterAll(async () => { await cleanupAll(sql); await closeSql() })

// Seed a court for a tenant. Used to build bookings/payments that must survive
// anonymization with their player_id severed but financial data intact.
async function seedCourt(tenantId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, surface_type, capacity, pricing)
    VALUES (${tenantId}, 'Cancha 1', 'synthetic_grass', 10, '{"rules":[]}')
    RETURNING id
  `
  return rows[0]!.id
}

async function seedBooking(
  tenantId: string,
  courtId: string,
  playerId: string,
  priceSnapshot = 800000,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      price_snapshot, status, type
    )
    VALUES (
      ${tenantId}, ${courtId}, ${playerId}, '2026-06-01', '18:00', '19:00',
      ('2026-06-01'::date + '18:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ('2026-06-01'::date + '19:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${priceSnapshot}, 'confirmed', 'spontaneous'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function seedPayment(
  tenantId: string,
  bookingId: string,
  playerId: string,
  amount = 240000,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO payments (tenant_id, booking_id, player_id, amount, type, method, status)
    VALUES (${tenantId}, ${bookingId}, ${playerId}, ${amount}, 'deposit', 'mercadopago', 'approved')
    RETURNING id
  `
  return rows[0]!.id
}

describe('anonymizePlayer', () => {
  it('borra TODOS los campos PII y deja status anonymized', async () => {
    const player = await createTestPlayer(sql)
    // Seed every nullable PII/ban field with a NON-NULL value so the assertions
    // below actually prove anonymizePlayer cleared them. createTestPlayer leaves
    // phone/avatar_url/preferred_area/ban_*/last_login_at NULL — asserting toBeNull
    // on those without seeding tests nothing (the column was already NULL).
    await sql`
      UPDATE players SET
        phone = '+5491122334455',
        avatar_url = 'https://cdn.test/avatar.png',
        preferred_area = 'Palermo',
        ban_reason = 'ban previo del sistema',
        ban_until = NOW() + INTERVAL '10 days',
        last_login_at = NOW()
      WHERE id = ${player.id}
    `

    await anonymizePlayer(player.id)

    const rows = await sql<Array<{
      status: string
      email: string
      first_name: string
      last_name: string
      phone: string | null
      avatar_url: string | null
      preferred_area: string | null
      ban_reason: string | null
      ban_until: Date | null
      agreed_to_terms_at: Date | null
      terms_version: string | null
      last_login_at: Date | null
    }>>`SELECT status, email, first_name, last_name, phone, avatar_url, preferred_area,
        ban_reason, ban_until, agreed_to_terms_at, terms_version, last_login_at
        FROM players WHERE id = ${player.id}`

    const row = rows[0]!
    expect(row.status).toBe('anonymized')
    expect(row.email).toBe(`anon-${player.id}@anon.local`)
    expect(row.first_name).toBe('[eliminado]')
    expect(row.last_name).toBe('[eliminado]')
    // These were non-NULL before anonymize → toBeNull now proves the wipe.
    expect(row.phone).toBeNull()
    expect(row.avatar_url).toBeNull()
    expect(row.preferred_area).toBeNull()
    expect(row.ban_reason).toBeNull()
    expect(row.ban_until).toBeNull()
    expect(row.agreed_to_terms_at).toBeNull() // createTestPlayer sets NOW()
    expect(row.terms_version).toBeNull() // createTestPlayer sets 'v1'
    expect(row.last_login_at).toBeNull()
  })

  it('elimina los player_tenant_relationships de todos los complejos', async () => {
    const player = await createTestPlayer(sql)
    const t1 = await createTestTenant(sql)
    const t2 = await createTestTenant(sql)
    await linkPlayerToTenant(sql, t1.id, player.id)
    await linkPlayerToTenant(sql, t2.id, player.id)

    const before = await sql`SELECT id FROM player_tenant_relationships WHERE player_id = ${player.id}`
    expect(before).toHaveLength(2)

    await anonymizePlayer(player.id)

    const after = await sql`SELECT id FROM player_tenant_relationships WHERE player_id = ${player.id}`
    expect(after).toHaveLength(0)
  })

  it('elimina los tenant_player_bans del jugador', async () => {
    const player = await createTestPlayer(sql)
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await sql`INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_by)
              VALUES (${tenant.id}, ${player.id}, 'test ban', ${staff.id})`

    const before = await sql`SELECT id FROM tenant_player_bans WHERE player_id = ${player.id}`
    expect(before).toHaveLength(1)

    await anonymizePlayer(player.id)

    const bans = await sql`SELECT id FROM tenant_player_bans WHERE player_id = ${player.id}`
    expect(bans).toHaveLength(0)
  })

  it('desvincula player_id en bookings preservando la fila y sus datos financieros', async () => {
    const player = await createTestPlayer(sql)
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await seedCourt(tenant.id)
    await seedBooking(tenant.id, courtId, player.id, 800000)

    await anonymizePlayer(player.id)

    const bookings = await sql<{ player_id: string | null; price_snapshot: number; status: string }[]>`
      SELECT player_id, price_snapshot, status FROM bookings WHERE tenant_id = ${tenant.id}
    `
    expect(bookings).toHaveLength(1)
    expect(bookings[0]!.player_id).toBeNull()
    // Financial history must stay intact for the complex's accounting/metrics.
    expect(bookings[0]!.price_snapshot).toBe(800000)
    expect(bookings[0]!.status).toBe('confirmed')
  })

  it('desvincula player_id en payments preservando el monto', async () => {
    const player = await createTestPlayer(sql)
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await seedCourt(tenant.id)
    const bookingId = await seedBooking(tenant.id, courtId, player.id)
    await seedPayment(tenant.id, bookingId, player.id, 240000)

    await anonymizePlayer(player.id)

    const payments = await sql<{ player_id: string | null; amount: number; status: string }[]>`
      SELECT player_id, amount, status FROM payments WHERE tenant_id = ${tenant.id}
    `
    expect(payments).toHaveLength(1)
    expect(payments[0]!.player_id).toBeNull()
    // Payment amount/status preserved — financial record stays for the complex.
    expect(payments[0]!.amount).toBe(240000)
    expect(payments[0]!.status).toBe('approved')
  })

  it('desvincula bookings y payments en TODOS los complejos del jugador', async () => {
    const player = await createTestPlayer(sql)
    const t1 = await createTestTenant(sql)
    const t2 = await createTestTenant(sql)
    const s1 = await createTestStaffUser(sql)
    const s2 = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, t1.id, s1.id)
    await linkStaffToTenant(sql, t2.id, s2.id)
    await linkPlayerToTenant(sql, t1.id, player.id)
    await linkPlayerToTenant(sql, t2.id, player.id)

    const c1 = await seedCourt(t1.id)
    const c2 = await seedCourt(t2.id)
    const b1 = await seedBooking(t1.id, c1, player.id)
    const b2 = await seedBooking(t2.id, c2, player.id)
    await seedPayment(t1.id, b1, player.id)
    await seedPayment(t2.id, b2, player.id)

    await anonymizePlayer(player.id)

    const orphanBookings = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM bookings WHERE player_id = ${player.id}
    `
    const orphanPayments = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM payments WHERE player_id = ${player.id}
    `
    expect(Number(orphanBookings[0]!.count)).toBe(0)
    expect(Number(orphanPayments[0]!.count)).toBe(0)
    // Rows themselves survive in both tenants (2 bookings + 2 payments total).
    const totalBookings = await sql<{ count: string }[]>`SELECT COUNT(*) AS count FROM bookings`
    const totalPayments = await sql<{ count: string }[]>`SELECT COUNT(*) AS count FROM payments`
    expect(Number(totalBookings[0]!.count)).toBe(2)
    expect(Number(totalPayments[0]!.count)).toBe(2)
  })

  it('crea un audit log por complejo afectado con el motivo Ley 25.326', async () => {
    const player = await createTestPlayer(sql)
    const t1 = await createTestTenant(sql)
    const t2 = await createTestTenant(sql)
    await linkPlayerToTenant(sql, t1.id, player.id)
    await linkPlayerToTenant(sql, t2.id, player.id)

    await anonymizePlayer(player.id)

    const logs = await sql<{ tenant_id: string; action: string; reason: string | null }[]>`
      SELECT tenant_id, action, metadata->>'reason' AS reason
      FROM audit_logs WHERE resource_id = ${player.id} AND action = 'player.anonymized'
    `
    expect(logs).toHaveLength(2)
    const tenantIds = logs.map((l) => l.tenant_id).sort()
    expect(tenantIds).toEqual([t1.id, t2.id].sort())
    expect(logs.every((l) => l.reason === 'Ley 25.326 derecho de supresión')).toBe(true)
  })

  it('anonimiza un jugador sin complejos sin crear audit logs', async () => {
    const player = await createTestPlayer(sql)

    await anonymizePlayer(player.id)

    const rows = await sql<{ status: string }[]>`SELECT status FROM players WHERE id = ${player.id}`
    expect(rows[0]!.status).toBe('anonymized')
    const logs = await sql`
      SELECT id FROM audit_logs WHERE resource_id = ${player.id} AND action = 'player.anonymized'
    `
    expect(logs).toHaveLength(0)
  })

  it('lanza PlayerNotFoundError para un id inexistente', async () => {
    await expect(anonymizePlayer('00000000-0000-0000-0000-000000000001')).rejects.toThrow(
      PlayerNotFoundError,
    )
  })

  it('lanza PlayerAlreadyAnonymizedError en la segunda llamada', async () => {
    const player = await createTestPlayer(sql)
    await anonymizePlayer(player.id)
    await expect(anonymizePlayer(player.id)).rejects.toThrow(PlayerAlreadyAnonymizedError)
  })
})
