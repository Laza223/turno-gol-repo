import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import {
  closeSql,
  getSql,
  withContext,
  withContextRollback,
  withPlayerContext,
} from '@/shared/db/client'
import {
  cancelMatch,
  createOpenMatch,
  getOpenMatches,
  joinMatch,
} from '@/modules/open-matches/open-match.service'
import {
  OpenMatchAlreadyExistsError,
  OpenMatchAlreadyJoinedError,
  OpenMatchBookingNotConfirmedError,
  OpenMatchBookingNotFoundError,
  OpenMatchCannotJoinOwnError,
  OpenMatchNotCancelableError,
  OpenMatchNotJoinableError,
  OpenMatchNotOwnerError,
} from '@/modules/open-matches/open-match.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { insertBooking } from '../helpers/factories'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      prices: { '60': 800000, '120': 1500000 },
    },
  ],
}

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

// Genera slots de 30 min distintos desde las 08:00 (minutos absolutos) para no
// chocar con la restricción de exclusión de bookings confirmados en una cancha.
let slot = 0
const fmtTime = (abs: number): string =>
  `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
async function confirmedBooking(
  tenantId: string,
  courtId: string,
  playerId: string,
  date = '2027-05-10',
): Promise<string> {
  const startAbs = 8 * 60 + slot++ * 30
  return insertBooking(getSql(), {
    tenantId,
    courtId,
    playerId,
    date,
    timeStart: fmtTime(startAbs),
    timeEnd: fmtTime(startAbs + 30),
    status: 'confirmed',
  })
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('open-matches service: create', () => {
  it('crea un partido abierto desde una reserva confirmada', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, player.id)

    const match = await withPlayerContext(player.id, (tx) =>
      createOpenMatch(player.id, bookingId, 3, { gender: 'mixed', level: 'intermediate' }, tx),
    )

    expect(match.bookingId).toBe(bookingId)
    expect(match.creatorPlayerId).toBe(player.id)
    expect(match.tenantId).toBe(tenant.id)
    expect(match.slotsTotal).toBe(3)
    expect(match.slotsFilled).toBe(0)
    expect(match.status).toBe('open')
    expect(match.restrictions).toEqual({ gender: 'mixed', level: 'intermediate' })
    expect(match.expiresAt).toBeInstanceOf(Date) // = horario de inicio
  })

  it('rechaza crear desde una reserva no confirmada', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const pending = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId: court,
      playerId: player.id,
      status: 'pending_payment',
    })

    await expect(
      withPlayerContext(player.id, (tx) =>
        createOpenMatch(player.id, pending, 2, null, tx),
      ),
    ).rejects.toBeInstanceOf(OpenMatchBookingNotConfirmedError)
  })

  it('rechaza crear desde una reserva ajena', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const owner = await createTestPlayer()
    const intruder = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, owner.id)

    await expect(
      withPlayerContext(intruder.id, (tx) =>
        createOpenMatch(intruder.id, bookingId, 2, null, tx),
      ),
    ).rejects.toBeInstanceOf(OpenMatchBookingNotFoundError)
  })

  it('rechaza un segundo partido activo para la misma reserva', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, player.id)

    await withPlayerContext(player.id, (tx) =>
      createOpenMatch(player.id, bookingId, 2, null, tx),
    )
    await expect(
      withPlayerContext(player.id, (tx) =>
        createOpenMatch(player.id, bookingId, 2, null, tx),
      ),
    ).rejects.toBeInstanceOf(OpenMatchAlreadyExistsError)
  })
})

describe('open-matches service: join', () => {
  it('sumarse incrementa cupos y pasa a full al completarse', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const p1 = await createTestPlayer()
    const p2 = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 2, null, tx),
    )

    const after1 = await withPlayerContext(p1.id, (tx) => joinMatch(p1.id, match.id, tx))
    expect(after1.slotsFilled).toBe(1)
    expect(after1.status).toBe('open')

    const after2 = await withPlayerContext(p2.id, (tx) => joinMatch(p2.id, match.id, tx))
    expect(after2.slotsFilled).toBe(2)
    expect(after2.status).toBe('full')
  })

  it('no se puede sumar a un partido completo', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const p1 = await createTestPlayer()
    const p2 = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 1, null, tx),
    )
    await withPlayerContext(p1.id, (tx) => joinMatch(p1.id, match.id, tx))

    await expect(
      withPlayerContext(p2.id, (tx) => joinMatch(p2.id, match.id, tx)),
    ).rejects.toBeInstanceOf(OpenMatchNotJoinableError)
  })

  it('el creador no puede sumarse a su propio partido', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 2, null, tx),
    )

    await expect(
      withPlayerContext(creator.id, (tx) => joinMatch(creator.id, match.id, tx)),
    ).rejects.toBeInstanceOf(OpenMatchCannotJoinOwnError)
  })

  it('no se puede sumar dos veces', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const p1 = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 3, null, tx),
    )
    await withPlayerContext(p1.id, (tx) => joinMatch(p1.id, match.id, tx))

    await expect(
      withPlayerContext(p1.id, (tx) => joinMatch(p1.id, match.id, tx)),
    ).rejects.toBeInstanceOf(OpenMatchAlreadyJoinedError)
  })

  it('no se puede sumar a un partido expirado', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const p1 = await createTestPlayer()
    // Reserva en el pasado → expires_at en el pasado.
    const bookingId = await confirmedBooking(tenant.id, court, creator.id, '2020-01-06')
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 2, null, tx),
    )

    await expect(
      withPlayerContext(p1.id, (tx) => joinMatch(p1.id, match.id, tx)),
    ).rejects.toBeInstanceOf(OpenMatchNotJoinableError)
  })

  it('joins concurrentes sobre 1 cupo: exactamente uno gana', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const p1 = await createTestPlayer()
    const p2 = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 1, null, tx),
    )

    const results = await Promise.allSettled([
      withPlayerContext(p1.id, (tx) => joinMatch(p1.id, match.id, tx)),
      withPlayerContext(p2.id, (tx) => joinMatch(p2.id, match.id, tx)),
    ])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const sql = getSql()
    const rows = await sql<{ slots_filled: number; status: string }[]>`
      SELECT slots_filled, status FROM open_matches WHERE id = ${match.id}
    `
    expect(rows[0]!.slots_filled).toBe(1)
    expect(rows[0]!.status).toBe('full')
  })

  it('bajarse libera el cupo y reabre el partido (trigger DELETE)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const p1 = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 1, null, tx),
    )
    await withPlayerContext(p1.id, (tx) => joinMatch(p1.id, match.id, tx))

    const sql = getSql()
    let row = await sql<{ slots_filled: number; status: string }[]>`
      SELECT slots_filled, status FROM open_matches WHERE id = ${match.id}
    `
    expect(row[0]!.status).toBe('full')

    // El jugador se baja (DELETE de su inscripción) → dispara el trigger DELETE.
    await withPlayerContext(p1.id, (tx) =>
      tx.execute(
        drizzleSql`DELETE FROM open_match_players WHERE open_match_id = ${match.id} AND player_id = ${p1.id}`,
      ),
    )

    row = await sql<{ slots_filled: number; status: string }[]>`
      SELECT slots_filled, status FROM open_matches WHERE id = ${match.id}
    `
    expect(row[0]!.slots_filled).toBe(0)
    expect(row[0]!.status).toBe('open')
  })
})

describe('open-matches service: cancel', () => {
  it('el creador cancela; no-creador y estado no cancelable fallan', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const other = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 2, null, tx),
    )

    await expect(
      withPlayerContext(other.id, (tx) => cancelMatch(other.id, match.id, tx)),
    ).rejects.toBeInstanceOf(OpenMatchNotOwnerError)

    const canceled = await withPlayerContext(creator.id, (tx) =>
      cancelMatch(creator.id, match.id, tx),
    )
    expect(canceled.status).toBe('canceled')

    await expect(
      withPlayerContext(creator.id, (tx) => cancelMatch(creator.id, match.id, tx)),
    ).rejects.toBeInstanceOf(OpenMatchNotCancelableError)
  })

  it('no se puede sumar a un partido cancelado', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const p1 = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 2, null, tx),
    )
    await withPlayerContext(creator.id, (tx) => cancelMatch(creator.id, match.id, tx))

    await expect(
      withPlayerContext(p1.id, (tx) => joinMatch(p1.id, match.id, tx)),
    ).rejects.toBeInstanceOf(OpenMatchNotJoinableError)
  })
})

describe('open-matches public listing', () => {
  it('lista abiertos con info del complejo y cupos restantes; filtra y excluye no-abiertos/expirados', async () => {
    const tenant = await createTestTenant(getSql(), { name: 'Predio Norte' })
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const joiner = await createTestPlayer()

    // Partido abierto futuro.
    const b1 = await confirmedBooking(tenant.id, court, creator.id)
    const open = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, b1, 3, null, tx),
    )
    await withPlayerContext(joiner.id, (tx) => joinMatch(joiner.id, open.id, tx))

    // Partido cancelado (no debe aparecer en status=open).
    const b2 = await confirmedBooking(tenant.id, court, creator.id)
    const toCancel = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, b2, 2, null, tx),
    )
    await withPlayerContext(creator.id, (tx) => cancelMatch(creator.id, toCancel.id, tx))

    // Partido expirado (booking pasado).
    const b3 = await confirmedBooking(tenant.id, court, creator.id, '2020-01-06')
    await withPlayerContext(creator.id, (tx) => createOpenMatch(creator.id, b3, 2, null, tx))

    const page = await getOpenMatches({ tenantId: tenant.id })
    expect(page.total).toBe(1)
    expect(page.matches).toHaveLength(1)
    const card = page.matches[0]!
    expect(card.id).toBe(open.id)
    expect(card.slotsRemaining).toBe(2) // 3 total - 1 filled
    expect(card.tenant.name).toBe('Predio Norte')
    expect(card.tenant.slug).toBe(tenant.slug)

    // Filtro por ciudad inexistente → vacío.
    const none = await getOpenMatches({ tenantId: tenant.id, city: 'Ciudad Inexistente' })
    expect(none.total).toBe(0)
  })
})

describe('open-matches RLS', () => {
  it('lectura pública: cualquier rol ve los partidos (USING true)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 2, null, tx),
    )

    const rows = await withContext({ role: 'authenticated' }, (tx) =>
      tx`SELECT id FROM open_matches WHERE id = ${match.id}` as unknown as Promise<
        unknown[]
      >,
    )
    expect((rows as unknown as unknown[]).length).toBe(1)
  })

  it('INSERT open_matches: no puede crear a nombre de otro creador (WITH CHECK)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const a = await createTestPlayer()
    const b = await createTestPlayer()
    const bookingA = await confirmedBooking(tenant.id, court, a.id)

    await expect(
      withContextRollback({ role: 'authenticated', playerId: a.id }, (tx) =>
        tx`
          INSERT INTO open_matches (booking_id, creator_player_id, tenant_id, slots_total)
          VALUES (${bookingA}, ${b.id}, ${tenant.id}, 2)
        `,
      ),
    ).rejects.toThrow()
  })

  it('UPDATE open_matches: un no-creador no puede cancelar (USING)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const other = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 2, null, tx),
    )

    const updated = await withContextRollback(
      { role: 'authenticated', playerId: other.id },
      (tx) =>
        tx`UPDATE open_matches SET status = 'canceled' WHERE id = ${match.id} RETURNING id` as unknown as Promise<
          unknown[]
        >,
    )
    expect((updated as unknown as unknown[]).length).toBe(0)
  })

  it('INSERT open_match_players: no puede anotar a otro jugador (WITH CHECK)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const a = await createTestPlayer()
    const b = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 3, null, tx),
    )

    await expect(
      withContextRollback({ role: 'authenticated', playerId: a.id }, (tx) =>
        tx`
          INSERT INTO open_match_players (open_match_id, player_id)
          VALUES (${match.id}, ${b.id})
        `,
      ),
    ).rejects.toThrow()
  })
})

// Regresiones de la revisión adversarial (migración 020).
describe('open-matches review fixes', () => {
  it('#4 creates concurrentes para la misma reserva: uno gana, el otro AlreadyExists', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)

    const results = await Promise.allSettled([
      withPlayerContext(creator.id, (tx) => createOpenMatch(creator.id, bookingId, 2, null, tx)),
      withPlayerContext(creator.id, (tx) => createOpenMatch(creator.id, bookingId, 2, null, tx)),
    ])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const rej = results.filter((r) => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(rej).toHaveLength(1)
    expect((rej[0] as PromiseRejectedResult).reason).toBeInstanceOf(OpenMatchAlreadyExistsError)
  })

  it('#2 el creador NO puede repuntar booking_id/tenant_id (trigger inmutable)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 2, null, tx),
    )
    // Otra reserva del mismo creador en otro complejo.
    const other = await createTestTenant()
    const courtO = await insertCourt(other.id)
    const bookingO = await confirmedBooking(other.id, courtO, creator.id)

    await expect(
      withContextRollback({ role: 'authenticated', playerId: creator.id }, (tx) =>
        tx`UPDATE open_matches SET booking_id = ${bookingO}, tenant_id = ${other.id} WHERE id = ${match.id}`,
      ),
    ).rejects.toThrow()
  })

  it('#6 el creador no puede anotarse ni por inserción directa (backstop DB)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 3, null, tx),
    )

    await expect(
      withContextRollback({ role: 'authenticated', playerId: creator.id }, (tx) =>
        tx`INSERT INTO open_match_players (open_match_id, player_id) VALUES (${match.id}, ${creator.id})`,
      ),
    ).rejects.toThrow()
  })

  it('#7 bajarse de un partido ya expirado NO lo reabre', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const p1 = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    const match = await withPlayerContext(creator.id, (tx) =>
      createOpenMatch(creator.id, bookingId, 1, null, tx),
    )
    await withPlayerContext(p1.id, (tx) => joinMatch(p1.id, match.id, tx)) // → full

    const sql = getSql()
    // Simula que el partido expiró luego de llenarse.
    await sql`UPDATE open_matches SET expires_at = now() - interval '1 hour' WHERE id = ${match.id}`
    await withPlayerContext(p1.id, (tx) =>
      tx.execute(
        drizzleSql`DELETE FROM open_match_players WHERE open_match_id = ${match.id} AND player_id = ${p1.id}`,
      ),
    )

    const row = await sql<{ status: string; slots_filled: number }[]>`
      SELECT status, slots_filled FROM open_matches WHERE id = ${match.id}
    `
    expect(row[0]!.status).toBe('full') // NO reabrió pese a liberar cupo
    expect(row[0]!.slots_filled).toBe(0)
  })

  it('#3 la card pública NO expone creatorPlayerId/bookingId', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const creator = await createTestPlayer()
    const bookingId = await confirmedBooking(tenant.id, court, creator.id)
    await withPlayerContext(creator.id, (tx) => createOpenMatch(creator.id, bookingId, 2, null, tx))

    const { matches } = await getOpenMatches({ tenantId: tenant.id })
    expect(matches.length).toBeGreaterThanOrEqual(1)
    const card = matches[0]! as Record<string, unknown>
    expect(card.creatorPlayerId).toBeUndefined()
    expect(card.bookingId).toBeUndefined()
  })
})
