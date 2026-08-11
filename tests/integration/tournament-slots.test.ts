import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { insertCourt, insertTournament } from '../helpers/factories'
import {
  countTournamentBookings,
  listTournamentSlots,
  releaseTournamentSlots,
  reserveTournamentSlots,
} from '@/modules/tournaments/tournament-slots.service'
import { deleteTournament } from '@/modules/tournaments/tournament.service'
import {
  NoSlotsReservedError,
  TournamentCourtUnavailableError,
  TournamentHasBookingsError,
} from '@/modules/tournaments/tournament.errors'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

/** Complejo + staff + cancha + torneo, todo listo para reservar. */
async function setupTournament() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const courtId = await insertCourt(sql, tenant.id)
  const tournamentId = await insertTournament(sql, tenant.id)
  return { tenant, staff, courtId, tournamentId }
}

async function bookingsOf(tournamentId: string) {
  const sql = getSql()
  return sql<
    Array<{
      id: string
      date: string
      time_start: string
      time_end: string
      type: string
      status: string
      price_snapshot: number
      player_id: string | null
    }>
  >`
    SELECT id, date::text AS date, time_start, time_end, type, status,
           price_snapshot, player_id
    FROM bookings
    WHERE tournament_id = ${tournamentId}
    ORDER BY starts_at
  `
}

describe('reserveTournamentSlots', () => {
  it('materializa una reserva por hora, con precio 0 y tipo tournament', async () => {
    const { tenant, staff, courtId, tournamentId } = await setupTournament()

    const result = await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId],
          dates: ['2027-03-06'],
          timeStart: '14:00',
          timeEnd: '18:00',
        },
        tx,
      ),
    )

    expect(result.reserved).toBe(4)
    expect(result.conflicts).toEqual([])

    const rows = await bookingsOf(tournamentId)
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.time_start.slice(0, 5))).toEqual(['14:00', '15:00', '16:00', '17:00'])
    // La plata del torneo entra por la inscripción, no por hora: precio 0 y sin
    // jugador, igual que un bloqueo.
    expect(rows.every((r) => r.type === 'tournament')).toBe(true)
    expect(rows.every((r) => r.status === 'confirmed')).toBe(true)
    expect(rows.every((r) => r.price_snapshot === 0)).toBe(true)
    expect(rows.every((r) => r.player_id === null)).toBe(true)
  })

  it('expande varias canchas por varias fechas', async () => {
    const sql = getSql()
    const { tenant, staff, courtId, tournamentId } = await setupTournament()
    const court2 = await insertCourt(sql, tenant.id)

    const result = await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId, court2],
          dates: ['2027-03-06', '2027-03-13'],
          timeStart: '10:00',
          timeEnd: '13:00',
        },
        tx,
      ),
    )

    // 2 canchas × 2 fechas × 3 horas
    expect(result.reserved).toBe(12)
  })

  it('saltea la hora ya ocupada y sigue con el resto (skip-on-conflict)', async () => {
    const sql = getSql()
    const { tenant, staff, courtId, tournamentId } = await setupTournament()

    // Una reserva común pisando las 16:00 de esa fecha.
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status
      ) VALUES (
        ${tenant.id}, ${courtId}, '2027-03-06', '16:00', '17:00',
        '2027-03-06T19:00:00Z', '2027-03-06T20:00:00Z',
        'spontaneous', 'confirmed', 100000, 0, 'not_required'
      )
    `

    const result = await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId],
          dates: ['2027-03-06'],
          timeStart: '14:00',
          timeEnd: '18:00',
        },
        tx,
      ),
    )

    // Se toman 14, 15 y 17; la de las 16 se reporta y NO aborta el resto.
    expect(result.reserved).toBe(3)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      courtId,
      date: '2027-03-06',
      timeStart: '16:00',
    })

    const rows = await bookingsOf(tournamentId)
    expect(rows.map((r) => r.time_start.slice(0, 5))).toEqual(['14:00', '15:00', '17:00'])
  })

  it('si TODAS las horas están ocupadas, falla en vez de decir que anduvo bien', async () => {
    const sql = getSql()
    const { tenant, staff, courtId, tournamentId } = await setupTournament()

    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status
      ) VALUES (
        ${tenant.id}, ${courtId}, '2027-04-10', '20:00', '21:00',
        '2027-04-10T23:00:00Z', '2027-04-11T00:00:00Z',
        'spontaneous', 'confirmed', 100000, 0, 'not_required'
      )
    `

    await expect(
      withTenantContext(tenant.id, (tx) =>
        reserveTournamentSlots(
          tenant.id,
          tournamentId,
          staff.id,
          {
            courtIds: [courtId],
            dates: ['2027-04-10'],
            timeStart: '20:00',
            timeEnd: '21:00',
          },
          tx,
        ),
      ),
    ).rejects.toThrow(NoSlotsReservedError)

    expect(await bookingsOf(tournamentId)).toHaveLength(0)
  })

  it('una reserva cancelada NO bloquea la hora (espeja el exclusion constraint)', async () => {
    const sql = getSql()
    const { tenant, staff, courtId, tournamentId } = await setupTournament()

    // El constraint solo mira pending_payment y confirmed: una cancelada libera
    // el turno, así que el torneo tiene que poder tomarlo.
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status
      ) VALUES (
        ${tenant.id}, ${courtId}, '2027-05-08', '15:00', '16:00',
        '2027-05-08T18:00:00Z', '2027-05-08T19:00:00Z',
        'spontaneous', 'canceled_no_refund', 100000, 0, 'not_required'
      )
    `

    const result = await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId],
          dates: ['2027-05-08'],
          timeStart: '15:00',
          timeEnd: '16:00',
        },
        tx,
      ),
    )

    expect(result.reserved).toBe(1)
    expect(result.conflicts).toEqual([])
  })

  it('el exclusion constraint impide que otra reserva pise una hora del torneo', async () => {
    const sql = getSql()
    const { tenant, staff, courtId, tournamentId } = await setupTournament()

    await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId],
          dates: ['2027-06-05'],
          timeStart: '18:00',
          timeEnd: '19:00',
        },
        tx,
      ),
    )

    // La garantía real no es el chequeo optimista: es la DB.
    await expect(
      sql`
        INSERT INTO bookings (
          tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
          type, status, price_snapshot, deposit_amount, deposit_status
        ) VALUES (
          ${tenant.id}, ${courtId}, '2027-06-05', '18:00', '19:00',
          '2027-06-05T21:00:00Z', '2027-06-05T22:00:00Z',
          'spontaneous', 'confirmed', 100000, 0, 'not_required'
        )
      `,
    ).rejects.toThrow(/no_overlapping_bookings|exclusion constraint/i)
  })

  it('rechaza una cancha de otro complejo', async () => {
    const sql = getSql()
    const { tenant, staff, tournamentId } = await setupTournament()
    const otherTenant = await createTestTenant(sql)
    const foreignCourt = await insertCourt(sql, otherTenant.id)

    await expect(
      withTenantContext(tenant.id, (tx) =>
        reserveTournamentSlots(
          tenant.id,
          tournamentId,
          staff.id,
          {
            courtIds: [foreignCourt],
            dates: ['2027-03-06'],
            timeStart: '14:00',
            timeEnd: '15:00',
          },
          tx,
        ),
      ),
    ).rejects.toThrow(TournamentCourtUnavailableError)
  })

  it('rechaza una cancha offline', async () => {
    const sql = getSql()
    const { tenant, staff, courtId, tournamentId } = await setupTournament()
    await sql`UPDATE courts SET status = 'offline' WHERE id = ${courtId}`

    await expect(
      withTenantContext(tenant.id, (tx) =>
        reserveTournamentSlots(
          tenant.id,
          tournamentId,
          staff.id,
          {
            courtIds: [courtId],
            dates: ['2027-03-06'],
            timeStart: '14:00',
            timeEnd: '15:00',
          },
          tx,
        ),
      ),
    ).rejects.toThrow(TournamentCourtUnavailableError)
  })
})

describe('reserveTournamentSlots — complejo que cierra después de medianoche', () => {
  it('guarda las horas de madrugada bajo el día operativo anterior', async () => {
    const sql = getSql()
    const { tenant, staff, courtId, tournamentId } = await setupTournament()
    await sql`UPDATE tenants SET closes_next_day = true WHERE id = ${tenant.id}`

    const result = await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId],
          dates: ['2027-07-03'],
          timeStart: '22:00',
          timeEnd: '02:00',
        },
        tx,
      ),
    )

    expect(result.reserved).toBe(4)

    const rows = await bookingsOf(tournamentId)
    // Las 4 filas llevan el MISMO día operativo, aunque dos sucedan el día
    // calendario siguiente.
    expect(rows.every((r) => r.date === '2027-07-03')).toBe(true)
    expect(rows.map((r) => r.time_start.slice(0, 5))).toEqual(['22:00', '23:00', '00:00', '01:00'])
    // El slot 23:00→24:00 se guarda con '24:00': '00:00' violaría chk_time_valid.
    expect(rows[1]!.time_end.slice(0, 5)).toBe('24:00')
  })
})

describe('releaseTournamentSlots', () => {
  it('libera de una fecha en adelante y conserva lo ya jugado', async () => {
    const { tenant, staff, courtId, tournamentId } = await setupTournament()

    await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId],
          dates: ['2027-03-06', '2027-03-13', '2027-03-20'],
          timeStart: '14:00',
          timeEnd: '15:00',
        },
        tx,
      ),
    )
    expect(await bookingsOf(tournamentId)).toHaveLength(3)

    const released = await withTenantContext(tenant.id, (tx) =>
      releaseTournamentSlots(tenant.id, tournamentId, staff.id, '2027-03-13', tx),
    )

    expect(released.released).toBe(2)
    const rows = await bookingsOf(tournamentId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.date).toBe('2027-03-06')
  })

  it('la hora liberada vuelve a estar disponible para una reserva común', async () => {
    const sql = getSql()
    const { tenant, staff, courtId, tournamentId } = await setupTournament()

    await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId],
          dates: ['2027-08-07'],
          timeStart: '16:00',
          timeEnd: '17:00',
        },
        tx,
      ),
    )
    await withTenantContext(tenant.id, (tx) =>
      releaseTournamentSlots(tenant.id, tournamentId, staff.id, '2027-08-07', tx),
    )

    // Si el DELETE no fuera físico, el exclusion constraint seguiría frenando.
    await expect(
      sql`
        INSERT INTO bookings (
          tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
          type, status, price_snapshot, deposit_amount, deposit_status
        ) VALUES (
          ${tenant.id}, ${courtId}, '2027-08-07', '16:00', '17:00',
          '2027-08-07T19:00:00Z', '2027-08-07T20:00:00Z',
          'spontaneous', 'confirmed', 100000, 0, 'not_required'
        )
      `,
    ).resolves.toBeDefined()
  })
})

describe('listTournamentSlots y guard de borrado', () => {
  it('lista las horas del torneo en orden cronológico', async () => {
    const { tenant, staff, courtId, tournamentId } = await setupTournament()

    await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId],
          dates: ['2027-09-11', '2027-09-04'],
          timeStart: '19:00',
          timeEnd: '21:00',
        },
        tx,
      ),
    )

    const slots = await withTenantContext(tenant.id, (tx) =>
      listTournamentSlots(tenant.id, tournamentId, tx),
    )
    expect(slots).toHaveLength(4)
    expect(slots.map((s) => `${s.date} ${s.timeStart}`)).toEqual([
      '2027-09-04 19:00',
      '2027-09-04 20:00',
      '2027-09-11 19:00',
      '2027-09-11 20:00',
    ])
  })

  it('no deja borrar un torneo que todavía posee horas', async () => {
    const { tenant, staff, courtId, tournamentId } = await setupTournament()

    await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(
        tenant.id,
        tournamentId,
        staff.id,
        {
          courtIds: [courtId],
          dates: ['2027-10-02'],
          timeStart: '14:00',
          timeEnd: '15:00',
        },
        tx,
      ),
    )

    expect(
      await withTenantContext(tenant.id, (tx) =>
        countTournamentBookings(tenant.id, tournamentId, tx),
      ),
    ).toBe(1)

    await expect(
      withTenantContext(tenant.id, (tx) => deleteTournament(tenant.id, staff.id, tournamentId, tx)),
    ).rejects.toThrow(TournamentHasBookingsError)

    // Liberadas las horas, el borrado pasa.
    await withTenantContext(tenant.id, (tx) =>
      releaseTournamentSlots(tenant.id, tournamentId, staff.id, '2000-01-01', tx),
    )
    await expect(
      withTenantContext(tenant.id, (tx) => deleteTournament(tenant.id, staff.id, tournamentId, tx)),
    ).resolves.toBeUndefined()
  })
})
