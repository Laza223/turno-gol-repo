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
beforeEach(async () => {
  await cleanupAll(sql)
})
afterAll(async () => {
  await cleanupAll(sql)
  await closeSql()
})

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
  timeStart = '18:00',
): Promise<string> {
  const timeEnd = `${String(Number(timeStart.slice(0, 2)) + 1).padStart(2, '0')}:00`
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      price_snapshot, status, type
    )
    VALUES (
      ${tenantId}, ${courtId}, ${playerId}, '2026-06-01', ${timeStart}, ${timeEnd},
      ('2026-06-01'::date + ${timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ('2026-06-01'::date + ${timeEnd}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
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
        last_login_at = NOW(),
        position = 'goalkeeper',
        zone = 'Luján',
        rival_accepted_at = NOW(),
        rival_terms_version = 'rival-test',
        signup_source = 'rival'
      WHERE id = ${player.id}
    `

    await anonymizePlayer(player.id)

    const rows = await sql<
      Array<{
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
        position: string | null
        zone: string | null
        rival_accepted_at: Date | null
        rival_terms_version: string | null
        signup_source: string | null
      }>
    >`SELECT status, email, first_name, last_name, phone, avatar_url, preferred_area,
        ban_reason, ban_until, agreed_to_terms_at, terms_version, last_login_at,
        position, zone, rival_accepted_at, rival_terms_version, signup_source
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
    // Perfil RIVAL: sembrado con valores reales arriba, así que el null prueba la limpieza.
    expect(row.position).toBeNull()
    expect(row.zone).toBeNull()
    expect(row.rival_accepted_at).toBeNull()
    expect(row.rival_terms_version).toBeNull()
    expect(row.signup_source).toBeNull()
  })

  it('elimina los player_tenant_relationships de todos los complejos', async () => {
    const player = await createTestPlayer(sql)
    const t1 = await createTestTenant(sql)
    const t2 = await createTestTenant(sql)
    await linkPlayerToTenant(sql, t1.id, player.id)
    await linkPlayerToTenant(sql, t2.id, player.id)

    const before =
      await sql`SELECT id FROM player_tenant_relationships WHERE player_id = ${player.id}`
    expect(before).toHaveLength(2)

    await anonymizePlayer(player.id)

    const after =
      await sql`SELECT id FROM player_tenant_relationships WHERE player_id = ${player.id}`
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

    const bookings = await sql<
      { player_id: string | null; price_snapshot: number; status: string }[]
    >`
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

  // ENS-27: enforce_booking_invariants_fn bloqueaba CUALQUIER UPDATE sobre un
  // booking terminal (completed/canceled_*/no_show/expired). anonymizePlayer
  // hace UPDATE bookings SET player_id = NULL sin filtrar por status (a
  // propósito: filtrar dejaría el historial sin anonimizar, violando ARCO),
  // así que un solo booking terminal abortaba toda la transacción y "Eliminar
  // cuenta" fallaba en silencio. Migración 045 agrega la excepción quirúrgica.
  it('anonimiza con éxito aunque el jugador tenga bookings en estado terminal', async () => {
    const player = await createTestPlayer(sql)
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await seedCourt(tenant.id)

    const pendingId = await seedBooking(tenant.id, courtId, player.id, 800000, '18:00')
    const completedId = await seedBooking(tenant.id, courtId, player.id, 900000, '19:00')
    const canceledId = await seedBooking(tenant.id, courtId, player.id, 700000, '20:00')

    await sql`UPDATE bookings SET status = 'completed' WHERE id = ${completedId}`
    await sql`UPDATE bookings SET status = 'canceled_no_refund' WHERE id = ${canceledId}`

    await expect(anonymizePlayer(player.id)).resolves.not.toThrow()

    const rows = await sql<{ id: string; player_id: string | null; status: string }[]>`
      SELECT id, player_id, status FROM bookings WHERE tenant_id = ${tenant.id}
    `
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.player_id).toBeNull()
    }
    const byId = new Map(rows.map((r) => [r.id, r]))
    // Status intacto: la excepción del trigger no tocó nada más que player_id.
    expect(byId.get(pendingId)!.status).toBe('confirmed')
    expect(byId.get(completedId)!.status).toBe('completed')
    expect(byId.get(canceledId)!.status).toBe('canceled_no_refund')
  })

  // Control: la excepción del trigger NO afloja la inmutabilidad general de
  // los bookings terminales — solo permite el UPDATE quirúrgico de player_id.
  it('sigue bloqueando UPDATEs sobre bookings terminales que no son la anonimización', async () => {
    const player = await createTestPlayer(sql)
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await seedCourt(tenant.id)
    const bookingId = await seedBooking(tenant.id, courtId, player.id, 800000)
    await sql`UPDATE bookings SET status = 'completed' WHERE id = ${bookingId}`

    // Cambiar OTRA columna (time_start) sin tocar player_id → debe seguir bloqueado.
    await expect(
      sql`UPDATE bookings SET time_start = '20:00' WHERE id = ${bookingId}`,
    ).rejects.toThrow(/estado terminal/)

    // player_id → NULL pero ADEMÁS otra columna cambia a la vez → debe seguir bloqueado.
    await expect(
      sql`UPDATE bookings SET player_id = NULL, time_start = '20:00' WHERE id = ${bookingId}`,
    ).rejects.toThrow(/estado terminal/)

    const row = await sql<{ player_id: string | null; time_start: string }[]>`
      SELECT player_id, time_start FROM bookings WHERE id = ${bookingId}
    `
    // Nada se modificó: ambos intentos fueron rechazados.
    expect(row[0]!.player_id).toBe(player.id)
    expect(row[0]!.time_start).toBe('18:00:00')
  })
})

// ─── RIVAL (migr. 099) ──────────────────────────────────────────────────────
// Se siembra por el pool admin (sin `app.current_player_id`): los triggers de
// reglas por actor se saltean, pero el recuento y la promoción del banco (AFTER
// de rival_participants) corren igual. Es exactamente la condición de ARCO.
describe('anonymizePlayer — RIVAL', () => {
  async function seedMatch(
    tenantId: string,
    organizerId: string,
    opts: { startsAt: 'future' | 'past'; capacity?: number; contact?: boolean },
  ): Promise<string> {
    const startsAt =
      opts.startsAt === 'future' ? "NOW() + INTERVAL '3 days'" : "NOW() - INTERVAL '1 day'"
    const onBoard = opts.contact === true
    const [m] = await sql<{ id: string }[]>`
      INSERT INTO rival_matches (
        tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared
      )
      VALUES (
        ${tenantId}, ${organizerId}, ${sql.unsafe(startsAt)}, 5, ${opts.capacity ?? 10}, 'parejo',
        true
      )
      RETURNING id
    `
    if (onBoard) {
      // Publicado exige el contacto ya guardado (trigger diferido): primero el
      // contacto, después se publica.
      await sql`
        INSERT INTO rival_match_contacts (match_id, whatsapp_digits)
        VALUES (${m!.id}, '5491155551234')
      `
      await sql`
        UPDATE rival_matches SET on_board = true, seeking = 'players', seeking_position = 'any'
        WHERE id = ${m!.id}
      `
    }
    return m!.id
  }

  async function addParticipant(
    tenantId: string,
    matchId: string,
    playerId: string,
    status: 'confirmed' | 'bench' | 'requested',
  ): Promise<void> {
    await sql`
      INSERT INTO rival_participants (tenant_id, match_id, player_id, role, status, origin)
      VALUES (${tenantId}, ${matchId}, ${playerId}, 'player', ${status},
              ${status === 'requested' ? 'board' : 'invite'})
    `
  }

  async function statusOf(matchId: string, playerId: string): Promise<string | undefined> {
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM rival_participants WHERE match_id = ${matchId} AND player_id = ${playerId}
    `
    return rows[0]?.status
  }

  it('el organizador: sus partidos abiertos se cancelan, salen del tablón y se borra el WhatsApp de todos', async () => {
    const tenant = await createTestTenant(sql)
    const org = await createTestPlayer(sql)
    const other = await createTestPlayer(sql)
    const upcoming = await seedMatch(tenant.id, org.id, { startsAt: 'future', contact: true })
    const past = await seedMatch(tenant.id, org.id, { startsAt: 'past', contact: true })
    await addParticipant(tenant.id, upcoming, other.id, 'confirmed')
    // Control: un partido de OTRO organizador con contacto no se toca.
    const bystanderOrg = await createTestPlayer(sql)
    const bystander = await seedMatch(tenant.id, bystanderOrg.id, {
      startsAt: 'future',
      contact: true,
    })

    await anonymizePlayer(org.id)

    const [up] = await sql<{ status: string; on_board: boolean; seeking: string | null }[]>`
      SELECT status, on_board, seeking FROM rival_matches WHERE id = ${upcoming}
    `
    expect(up).toEqual({ status: 'canceled', on_board: false, seeking: null })
    // El vencido es historia: sigue 'open' (se deriva como vencido), pero sin contacto.
    const [pa] = await sql<
      { status: string }[]
    >`SELECT status FROM rival_matches WHERE id = ${past}`
    expect(pa!.status).toBe('open')
    const contacts = await sql<{ match_id: string }[]>`
      SELECT match_id FROM rival_match_contacts WHERE match_id IN (${upcoming}, ${past}, ${bystander})
    `
    expect(contacts.map((c) => c.match_id)).toEqual([bystander])
    // Las filas históricas siguen, apuntando al jugador anonimizado.
    expect(await statusOf(upcoming, org.id)).toBe('confirmed')
    expect(await statusOf(upcoming, other.id)).toBe('confirmed')
    const [bm] = await sql<{ status: string }[]>`
      SELECT status FROM rival_matches WHERE id = ${bystander}
    `
    expect(bm!.status).toBe('open')
  })

  it('el participante: pasa a left, entra el primero del banco, se borran sus alertas', async () => {
    const tenant = await createTestTenant(sql)
    const org = await createTestPlayer(sql)
    const leaver = await createTestPlayer(sql)
    const bench1 = await createTestPlayer(sql)
    const bench2 = await createTestPlayer(sql)
    const matchId = await seedMatch(tenant.id, org.id, { startsAt: 'future', capacity: 2 })
    await addParticipant(tenant.id, matchId, leaver.id, 'confirmed')
    // El banco respeta el orden de llegada: bench1 antes que bench2.
    await addParticipant(tenant.id, matchId, bench1.id, 'bench')
    await new Promise((r) => setTimeout(r, 15))
    await addParticipant(tenant.id, matchId, bench2.id, 'bench')
    await sql`
      INSERT INTO rival_alert_subscriptions (player_id, tenant_id) VALUES (${leaver.id}, ${tenant.id})
    `
    // Un vencido donde también estaba: no se toca.
    const pastMatch = await seedMatch(tenant.id, org.id, { startsAt: 'past' })
    await addParticipant(tenant.id, pastMatch, leaver.id, 'confirmed')
    const [before] = await sql<{ confirmed_count: number }[]>`
      SELECT confirmed_count FROM rival_matches WHERE id = ${matchId}
    `
    // Control: el organizador y el que se va ocupan los 2 lugares, y el banco espera.
    expect(before!.confirmed_count).toBe(2)
    expect(await statusOf(matchId, bench1.id)).toBe('bench')

    await anonymizePlayer(leaver.id)

    expect(await statusOf(matchId, leaver.id)).toBe('left')
    expect(await statusOf(matchId, bench1.id)).toBe('confirmed')
    expect(await statusOf(matchId, bench2.id)).toBe('bench')
    const [after] = await sql<{ confirmed_count: number }[]>`
      SELECT confirmed_count FROM rival_matches WHERE id = ${matchId}
    `
    expect(after!.confirmed_count).toBe(2)
    expect(await statusOf(pastMatch, leaver.id)).toBe('confirmed')
    expect(
      await sql`SELECT 1 FROM rival_alert_subscriptions WHERE player_id = ${leaver.id}`,
    ).toHaveLength(0)
  })

  it('un pedido pendiente en un partido abierto también pasa a left', async () => {
    const tenant = await createTestTenant(sql)
    const org = await createTestPlayer(sql)
    const asker = await createTestPlayer(sql)
    const matchId = await seedMatch(tenant.id, org.id, { startsAt: 'future', contact: true })
    await addParticipant(tenant.id, matchId, asker.id, 'requested')

    await anonymizePlayer(asker.id)

    expect(await statusOf(matchId, asker.id)).toBe('left')
  })
})
