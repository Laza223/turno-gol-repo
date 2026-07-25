import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { insertCourt } from '../helpers/factories'
import { addTeam } from '@/modules/tournaments/tournament-team.service'
import {
  clearFixture,
  generateFixture,
  listFixture,
  listStages,
  rescheduleMatch,
} from '@/modules/tournaments/tournament-fixture.service'
import {
  releaseTournamentSlots,
  reserveTournamentSlots,
} from '@/modules/tournaments/tournament-slots.service'
import {
  FixtureAlreadyExistsError,
  FixtureGenerationError,
  MatchOutsideOwnedTimeError,
  TeamDoubleBookedError,
} from '@/modules/tournaments/tournament.errors'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

/** Complejo + cancha + torneo con N equipos anotados. */
async function setupTournament(opts: {
  teams: number
  format?: 'league' | 'knockout' | 'groups_playoff'
  matchDuration?: number
  courts?: number
}) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)

  const courtIds: string[] = []
  for (let i = 0; i < (opts.courts ?? 1); i++) {
    courtIds.push(await insertCourt(sql, tenant.id))
  }

  const rows = await sql<{ id: string }[]>`
    INSERT INTO tournaments (tenant_id, name, slug, format, starts_on, match_duration_minutes)
    VALUES (
      ${tenant.id}, 'Torneo Test', ${`t-${Math.floor(Math.random() * 1e9)}`},
      ${opts.format ?? 'league'}::tournament_format, '2027-03-06',
      ${opts.matchDuration ?? 60}
    )
    RETURNING id
  `
  const tournamentId = rows[0]!.id

  for (let i = 0; i < opts.teams; i++) {
    await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: `Equipo ${i + 1}` }, tx),
    )
  }

  return { tenant, staff, courtIds, tournamentId }
}

/** Toma `hours` horas por fecha en cada cancha. */
async function takeSlots(
  tenantId: string,
  tournamentId: string,
  staffId: string,
  courtIds: string[],
  dates: string[],
  timeStart = '14:00',
  timeEnd = '18:00',
) {
  return withTenantContext(tenantId, (tx) =>
    reserveTournamentSlots(
      tenantId,
      tournamentId,
      staffId,
      { courtIds, dates, timeStart, timeEnd },
      tx,
    ),
  )
}

describe('generateFixture — liga', () => {
  it('genera todos contra todos y los agenda en las horas tomadas', async () => {
    const { tenant, staff, courtIds, tournamentId } = await setupTournament({ teams: 4 })
    await takeSlots(tenant.id, tournamentId, staff.id, courtIds, [
      '2027-03-06',
      '2027-03-13',
    ])

    const result = await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )

    // 4 equipos, una rueda: 4*3/2 = 6 partidos, en 3 fechas.
    expect(result.matches).toBe(6)
    expect(result.stages).toBe(1)
    expect(result.unscheduled).toBe(0)

    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    expect(matches).toHaveLength(6)
    expect(matches.every((m) => m.startsAt !== null)).toBe(true)
    expect(matches.every((m) => m.bookingId !== null)).toBe(true)
    // Los nombres llegan resueltos para la UI.
    expect(matches.every((m) => m.homeTeamName && m.awayTeamName)).toBe(true)
  })

  it('ida y vuelta duplica los partidos', async () => {
    const { tenant, staff, courtIds, tournamentId } = await setupTournament({ teams: 4 })
    await takeSlots(tenant.id, tournamentId, staff.id, courtIds, [
      '2027-04-03',
      '2027-04-10',
      '2027-04-17',
    ])

    const result = await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, { legs: 2 }, tx),
    )
    expect(result.matches).toBe(12)
  })

  it('ningún equipo queda con dos partidos pisados', async () => {
    const { tenant, staff, courtIds, tournamentId } = await setupTournament({
      teams: 6,
      courts: 2,
    })
    await takeSlots(tenant.id, tournamentId, staff.id, courtIds, [
      '2027-05-01',
      '2027-05-08',
      '2027-05-15',
      '2027-05-22',
      '2027-05-29',
    ])
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )

    const sql = getSql()
    const clashes = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM tournament_matches a
      JOIN tournament_matches b
        ON a.id < b.id
       AND tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
       AND (a.home_team_id IN (b.home_team_id, b.away_team_id)
         OR a.away_team_id IN (b.home_team_id, b.away_team_id))
      WHERE a.tournament_id = ${tournamentId} AND a.starts_at IS NOT NULL
    `
    expect(clashes[0]!.n).toBe(0)
  })

  it('avisa cuántos partidos no entraron en vez de agendarlos a medias', async () => {
    const { tenant, staff, courtIds, tournamentId } = await setupTournament({ teams: 4 })
    // Una sola fecha de 2 horas: entran 2 partidos de los 6.
    await takeSlots(
      tenant.id,
      tournamentId,
      staff.id,
      courtIds,
      ['2027-06-05'],
      '14:00',
      '16:00',
    )

    const result = await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )

    expect(result.matches).toBe(6)
    expect(result.unscheduled).toBeGreaterThan(0)

    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    // Los que no entraron quedan sin día ni hora, pero existen.
    expect(matches.filter((m) => m.startsAt === null).length).toBe(result.unscheduled)
  })

  it('sin horas tomadas genera igual, pero todo sin agendar', async () => {
    const { tenant, staff, tournamentId } = await setupTournament({ teams: 4 })

    const result = await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )
    expect(result.matches).toBe(6)
    expect(result.unscheduled).toBe(6)
  })

  it('rechaza generar dos veces', async () => {
    const { tenant, staff, tournamentId } = await setupTournament({ teams: 4 })
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
      ),
    ).rejects.toThrow(FixtureAlreadyExistsError)
  })

  it('rechaza generar con menos de 2 equipos', async () => {
    const { tenant, staff, tournamentId } = await setupTournament({ teams: 1 })
    await expect(
      withTenantContext(tenant.id, (tx) =>
        generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
      ),
    ).rejects.toThrow(FixtureGenerationError)
  })
})

describe('generateFixture — eliminación directa', () => {
  it('el avance automático apunta a partidos reales de la ronda anterior', async () => {
    const { tenant, staff, tournamentId } = await setupTournament({
      teams: 8,
      format: 'knockout',
    })
    const result = await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )
    expect(result.matches).toBe(7)

    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const byId = new Map(matches.map((m) => [m.id, m]))

    for (const m of matches.filter((x) => x.round > 1)) {
      // Este es el paso que solo se puede probar contra DB: los índices del
      // motor puro tienen que haber quedado traducidos a UUIDs REALES.
      expect(m.homeSourceMatchId).not.toBeNull()
      expect(m.awaySourceMatchId).not.toBeNull()
      const src = byId.get(m.homeSourceMatchId!)
      expect(src).toBeDefined()
      expect(src!.round).toBeLessThan(m.round)
    }
  })

  it('con 16 equipos el cuadro entero queda bien cableado', async () => {
    // Los ids de los partidos se generan del lado del cliente justamente para
    // no depender del orden de RETURNING. Con 16 equipos (15 partidos, 4
    // rondas) un desorden en ese mapeo se notaría: algún partido apuntaría a
    // uno de su misma ronda, o el cuadro no convergería a una sola final.
    const { tenant, staff, tournamentId } = await setupTournament({
      teams: 16,
      format: 'knockout',
    })
    const result = await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )
    expect(result.matches).toBe(15)

    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const byId = new Map(matches.map((m) => [m.id, m]))

    // Cada fuente existe y es de la ronda inmediatamente anterior.
    for (const m of matches.filter((x) => x.round > 1)) {
      for (const src of [m.homeSourceMatchId, m.awaySourceMatchId]) {
        expect(src).not.toBeNull()
        const parent = byId.get(src!)
        expect(parent).toBeDefined()
        expect(parent!.round).toBe(m.round - 1)
      }
      // Y no se alimenta dos veces del mismo partido.
      expect(m.homeSourceMatchId).not.toBe(m.awaySourceMatchId)
    }

    // Ningún partido alimenta a dos distintos: el árbol converge a una final.
    const usados = matches.flatMap((m) =>
      [m.homeSourceMatchId, m.awaySourceMatchId].filter((x): x is string => x !== null),
    )
    expect(new Set(usados).size).toBe(usados.length)
    expect(matches.filter((m) => m.round === 4)).toHaveLength(1)
  })

  it('con el tercer puesto se alimenta de las dos semis', async () => {
    const { tenant, staff, tournamentId } = await setupTournament({
      teams: 4,
      format: 'knockout',
    })
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, { thirdPlace: true }, tx),
    )

    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const third = matches.find((m) => m.isThirdPlace)
    expect(third).toBeDefined()
    expect(third!.homeSourceMatchId).not.toBeNull()
    expect(third!.awaySourceMatchId).not.toBeNull()
  })
})

describe('generateFixture — grupos y playoffs', () => {
  it('arma dos fases: zonas y llaves', async () => {
    const { tenant, staff, tournamentId } = await setupTournament({
      teams: 8,
      format: 'groups_playoff',
    })
    const result = await withTenantContext(tenant.id, (tx) =>
      generateFixture(
        tenant.id,
        staff.id,
        tournamentId,
        { groupsCount: 2, teamsAdvancePerGroup: 2 },
        tx,
      ),
    )
    expect(result.stages).toBe(2)

    const stages = await withTenantContext(tenant.id, (tx) =>
      listStages(tenant.id, tournamentId, tx),
    )
    expect(stages.map((s) => s.kind)).toEqual(['group_stage', 'knockout'])
    expect(stages[0]!.groupsCount).toBe(2)

    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    // 2 zonas de 4: 6 partidos cada una = 12, más 3 de playoffs (semis + final).
    const zonales = matches.filter((m) => m.groupLabel !== null)
    expect(zonales).toHaveLength(12)
    expect(new Set(zonales.map((m) => m.groupLabel))).toEqual(new Set(['A', 'B']))
    expect(matches.filter((m) => m.groupLabel === null)).toHaveLength(3)
  })

  it('los playoffs se agendan DESPUÉS de las zonas, no mezclados', async () => {
    // Las fechas de zona y las rondas de playoffs empiezan las dos en round 1:
    // sin el stageOrder del scheduler, la semi podía caer en paralelo con la
    // fase de grupos. Y como los partidos de playoffs nacen sin equipos, la
    // restricción de "un equipo no juega dos veces" tampoco lo frenaba.
    const { tenant, staff, courtIds, tournamentId } = await setupTournament({
      teams: 8,
      format: 'groups_playoff',
      courts: 3,
    })
    await takeSlots(
      tenant.id,
      tournamentId,
      staff.id,
      courtIds,
      ['2027-11-06', '2027-11-13', '2027-11-20', '2027-11-27'],
      '14:00',
      '20:00',
    )

    await withTenantContext(tenant.id, (tx) =>
      generateFixture(
        tenant.id,
        staff.id,
        tournamentId,
        { groupsCount: 2, teamsAdvancePerGroup: 2 },
        tx,
      ),
    )

    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const zonales = matches.filter((m) => m.groupLabel !== null && m.startsAt !== null)
    const playoffs = matches.filter((m) => m.groupLabel === null && m.startsAt !== null)

    expect(zonales.length).toBeGreaterThan(0)
    expect(playoffs.length).toBeGreaterThan(0)

    const ultimaZona = Math.max(...zonales.map((m) => m.endsAt!.getTime()))
    for (const p of playoffs) {
      expect(p.startsAt!.getTime()).toBeGreaterThanOrEqual(ultimaZona)
    }
  })

  it('los playoffs nacen sin equipos: se resuelven al cerrar las zonas', async () => {
    const { tenant, staff, tournamentId } = await setupTournament({
      teams: 8,
      format: 'groups_playoff',
    })
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(
        tenant.id,
        staff.id,
        tournamentId,
        { groupsCount: 2, teamsAdvancePerGroup: 2 },
        tx,
      ),
    )
    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const playoffs = matches.filter((m) => m.groupLabel === null)
    for (const m of playoffs) {
      expect(m.homeTeamId).toBeNull()
      expect(m.awayTeamId).toBeNull()
    }
  })
})

describe('clearFixture', () => {
  it('borra partidos y fases pese a que los partidos se referencian entre sí', async () => {
    const { tenant, staff, tournamentId } = await setupTournament({
      teams: 8,
      format: 'knockout',
    })
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )

    const { deleted } = await withTenantContext(tenant.id, (tx) =>
      clearFixture(tenant.id, staff.id, tournamentId, tx),
    )
    expect(deleted).toBe(7)

    expect(
      await withTenantContext(tenant.id, (tx) => listFixture(tenant.id, tournamentId, tx)),
    ).toHaveLength(0)
    expect(
      await withTenantContext(tenant.id, (tx) => listStages(tenant.id, tournamentId, tx)),
    ).toHaveLength(0)
  })

  it('después de borrar se puede volver a generar', async () => {
    const { tenant, staff, tournamentId } = await setupTournament({ teams: 4 })
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )
    await withTenantContext(tenant.id, (tx) =>
      clearFixture(tenant.id, staff.id, tournamentId, tx),
    )
    const result = await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, { legs: 2 }, tx),
    )
    expect(result.matches).toBe(12)
  })
})

describe('rescheduleMatch', () => {
  it('mueve un partido a otra hora del torneo', async () => {
    const { tenant, staff, courtIds, tournamentId } = await setupTournament({ teams: 4 })
    await takeSlots(tenant.id, tournamentId, staff.id, courtIds, ['2027-07-03'])
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )

    const before = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const target = before.find((m) => m.startsAt !== null)!
    // 17:00 ART del 2027-07-03 = 20:00 UTC. La franja tomada va de 14 a 18.
    const nuevo = new Date('2027-07-03T20:00:00Z')

    const moved = await withTenantContext(tenant.id, (tx) =>
      rescheduleMatch(tenant.id, staff.id, target.id, nuevo, courtIds[0]!, tx),
    )

    expect(moved.startsAt!.toISOString()).toBe(nuevo.toISOString())
    expect(moved.bookingId).not.toBeNull()
  })

  it('rechaza moverlo fuera de las horas que el torneo posee', async () => {
    const { tenant, staff, courtIds, tournamentId } = await setupTournament({ teams: 4 })
    await takeSlots(tenant.id, tournamentId, staff.id, courtIds, ['2027-08-07'])
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )
    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        rescheduleMatch(
          tenant.id,
          staff.id,
          matches[0]!.id,
          new Date('2027-08-07T03:00:00Z'), // medianoche ART: fuera de la franja
          courtIds[0]!,
          tx,
        ),
      ),
    ).rejects.toThrow(MatchOutsideOwnedTimeError)
  })

  it('rechaza dejar a un equipo con dos partidos a la vez', async () => {
    const { tenant, staff, courtIds, tournamentId } = await setupTournament({
      teams: 4,
      courts: 2,
    })
    await takeSlots(tenant.id, tournamentId, staff.id, courtIds, ['2027-09-04'])
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )

    const matches = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const first = matches.find((m) => m.startsAt !== null)!
    // Otro partido donde juegue alguno de los mismos equipos.
    const other = matches.find(
      (m) =>
        m.id !== first.id &&
        m.startsAt !== null &&
        (m.homeTeamId === first.homeTeamId ||
          m.awayTeamId === first.homeTeamId ||
          m.homeTeamId === first.awayTeamId ||
          m.awayTeamId === first.awayTeamId),
    )!

    await expect(
      withTenantContext(tenant.id, (tx) =>
        rescheduleMatch(
          tenant.id,
          staff.id,
          other.id,
          first.startsAt!,
          first.courtId === courtIds[0] ? courtIds[1]! : courtIds[0]!,
          tx,
        ),
      ),
    ).rejects.toThrow(TeamDoubleBookedError)
  })
})

describe('liberar horas vs. fixture', () => {
  it('liberar las horas deja los partidos sin reserva pero NO los borra', async () => {
    // Es la razón del ON DELETE SET NULL en tournament_matches.booking_id:
    // sin eso, liberar horarios reventaría con una FK colgada.
    const { tenant, staff, courtIds, tournamentId } = await setupTournament({ teams: 4 })
    await takeSlots(tenant.id, tournamentId, staff.id, courtIds, ['2027-10-02'])
    await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, staff.id, tournamentId, {}, tx),
    )

    const before = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    expect(before.some((m) => m.bookingId !== null)).toBe(true)

    await withTenantContext(tenant.id, (tx) =>
      releaseTournamentSlots(tenant.id, tournamentId, staff.id, '2000-01-01', tx),
    )

    const after = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    expect(after).toHaveLength(before.length)
    expect(after.every((m) => m.bookingId === null)).toBe(true)
  })
})
