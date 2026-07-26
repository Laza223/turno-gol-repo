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
import { addTeam, addTeamPlayer, removeTeamPlayer } from '@/modules/tournaments/tournament-team.service'
import {
  clearFixture,
  generateFixture,
  listFixture,
} from '@/modules/tournaments/tournament-fixture.service'
import {
  addMatchEvent,
  clearMatchResult,
  deleteMatchEvent,
  listMatchEvents,
  markWalkover,
  saveMatchResult,
} from '@/modules/tournaments/tournament-result.service'
import {
  getDisciplineBoard,
  getStandings,
  getTopScorers,
} from '@/modules/tournaments/tournament-standings.service'
import {
  DownstreamMatchAlreadyPlayedError,
  DuplicateCardError,
  KnockoutTieUnresolvedError,
  MatchTeamsUndefinedError,
  TeamPlayerHasEventsError,
  WalkoverNeedsWinnerError,
  WalkoverWithEventsError,
} from '@/modules/tournaments/tournament.errors'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

async function setup(opts: {
  teams: number
  format?: 'league' | 'knockout' | 'groups_playoff'
  thirdPlace?: boolean
}) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  await insertCourt(sql, tenant.id)

  const rows = await sql<{ id: string }[]>`
    INSERT INTO tournaments (tenant_id, name, slug, format, starts_on, walkover_goals_for)
    VALUES (
      ${tenant.id}, 'Torneo Test', ${`r-${Math.floor(Math.random() * 1e9)}`},
      ${opts.format ?? 'league'}::tournament_format, '2027-03-06', 3
    )
    RETURNING id
  `
  const tournamentId = rows[0]!.id

  const teamIds: string[] = []
  for (let i = 0; i < opts.teams; i++) {
    const team = await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: `Equipo ${i + 1}` }, tx),
    )
    teamIds.push(team.id)
  }

  await withTenantContext(tenant.id, (tx) =>
    generateFixture(
      tenant.id,
      staff.id,
      tournamentId,
      { autoSchedule: false, thirdPlace: opts.thirdPlace },
      tx,
    ),
  )

  const matches = await withTenantContext(tenant.id, (tx) =>
    listFixture(tenant.id, tournamentId, tx),
  )

  return { tenant, staff, tournamentId, teamIds, matches }
}

describe('saveMatchResult', () => {
  it('rechaza una llave sin equipos definidos y no escribe nada', async () => {
    const { tenant, staff, tournamentId, matches } = await setup({
      teams: 4,
      format: 'knockout',
    })
    // La final: se alimenta de las dos semis, así que todavía no tiene equipos.
    const final = matches.find((m) => m.homeTeamId === null && m.awayTeamId === null)!

    await expect(
      withTenantContext(tenant.id, (tx) =>
        saveMatchResult(tenant.id, staff.id, { matchId: final.id, homeScore: 1, awayScore: 0 }, tx),
      ),
    ).rejects.toThrow(MatchTeamsUndefinedError)

    // Cero escrituras: la fila quedó intacta.
    const after = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const stillFinal = after.find((m) => m.id === final.id)!
    expect(stillFinal.status).toBe('scheduled')
    expect(stillFinal.homeScore).toBeNull()
  })

  it('una llave empatada sin penales no se puede cerrar', async () => {
    const { tenant, staff, matches } = await setup({ teams: 4, format: 'knockout' })
    const semi = matches.find((m) => m.homeTeamId !== null && m.awayTeamId !== null)!

    await expect(
      withTenantContext(tenant.id, (tx) =>
        saveMatchResult(tenant.id, staff.id, { matchId: semi.id, homeScore: 1, awayScore: 1 }, tx),
      ),
    ).rejects.toThrow(KnockoutTieUnresolvedError)
  })

  it('corregir un empate con penales a una victoria no explota con 23514', async () => {
    // El UPDATE tiene que limpiar los penales: si no, chk_match_penalties_on_draw
    // los deja huérfanos sobre un partido que ya no está empatado.
    const { tenant, staff, matches } = await setup({ teams: 4, format: 'knockout' })
    const semi = matches.find((m) => m.homeTeamId !== null && m.awayTeamId !== null)!

    await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(
        tenant.id,
        staff.id,
        { matchId: semi.id, homeScore: 1, awayScore: 1, homePenalties: 5, awayPenalties: 4 },
        tx,
      ),
    )

    const fixed = await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(tenant.id, staff.id, { matchId: semi.id, homeScore: 3, awayScore: 2 }, tx),
    )
    expect(fixed.homePenalties).toBeNull()
    expect(fixed.awayPenalties).toBeNull()
  })
})

describe('avance de llaves', () => {
  it('el ganador de la semi aparece en la final, y corregir la semi re-propaga', async () => {
    const { tenant, staff, tournamentId, matches } = await setup({
      teams: 4,
      format: 'knockout',
    })
    const semis = matches.filter((m) => m.homeTeamId !== null && m.awayTeamId !== null)
    const semi = semis[0]!

    await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(tenant.id, staff.id, { matchId: semi.id, homeScore: 2, awayScore: 0 }, tx),
    )

    let after = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const final = after.find((m) => m.homeSourceMatchId !== null || m.awaySourceMatchId !== null)!
    const slot = final.homeSourceMatchId === semi.id ? 'home' : 'away'
    expect(slot === 'home' ? final.homeTeamId : final.awayTeamId).toBe(semi.homeTeamId)

    // Corregir la semi da vuelta el clasificado.
    await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(tenant.id, staff.id, { matchId: semi.id, homeScore: 0, awayScore: 2 }, tx),
    )
    after = await withTenantContext(tenant.id, (tx) => listFixture(tenant.id, tournamentId, tx))
    const final2 = after.find((m) => m.id === final.id)!
    expect(slot === 'home' ? final2.homeTeamId : final2.awayTeamId).toBe(semi.awayTeamId)
  })

  it('borrar el resultado de la semi deja la final sin ese equipo', async () => {
    const { tenant, staff, tournamentId, matches } = await setup({
      teams: 4,
      format: 'knockout',
    })
    const semi = matches.find((m) => m.homeTeamId !== null && m.awayTeamId !== null)!

    await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(tenant.id, staff.id, { matchId: semi.id, homeScore: 2, awayScore: 0 }, tx),
    )
    await withTenantContext(tenant.id, (tx) =>
      clearMatchResult(tenant.id, staff.id, semi.id, tx),
    )

    const after = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const final = after.find((m) => m.homeSourceMatchId === semi.id || m.awaySourceMatchId === semi.id)!
    const slot = final.homeSourceMatchId === semi.id ? final.homeTeamId : final.awayTeamId
    expect(slot).toBeNull()
  })

  it('con la final ya jugada, corregir la semi falla y revierte el marcador', async () => {
    const { tenant, staff, tournamentId, matches } = await setup({
      teams: 4,
      format: 'knockout',
    })
    const semis = matches.filter((m) => m.homeTeamId !== null && m.awayTeamId !== null)

    for (const s of semis) {
      await withTenantContext(tenant.id, (tx) =>
        saveMatchResult(tenant.id, staff.id, { matchId: s.id, homeScore: 2, awayScore: 0 }, tx),
      )
    }
    const withFinal = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const final = withFinal.find(
      (m) => m.homeSourceMatchId !== null && m.awaySourceMatchId !== null && !m.isThirdPlace,
    )!
    await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(tenant.id, staff.id, { matchId: final.id, homeScore: 1, awayScore: 0 }, tx),
    )

    // Dar vuelta la semi cambiaría quién jugó una final ya disputada.
    await expect(
      withTenantContext(tenant.id, (tx) =>
        saveMatchResult(
          tenant.id,
          staff.id,
          { matchId: semis[0]!.id, homeScore: 0, awayScore: 3 },
          tx,
        ),
      ),
    ).rejects.toThrow(DownstreamMatchAlreadyPlayedError)

    // El throw revierte TODA la transacción: la semi conserva su 2-0.
    const after = await withTenantContext(tenant.id, (tx) =>
      listFixture(tenant.id, tournamentId, tx),
    )
    const semiAfter = after.find((m) => m.id === semis[0]!.id)!
    expect(semiAfter.homeScore).toBe(2)
    expect(semiAfter.awayScore).toBe(0)
  })
})

describe('walkover', () => {
  it('el rival gana con los goles configurados', async () => {
    const { tenant, staff, matches } = await setup({ teams: 4 })
    const m = matches[0]!

    const row = await withTenantContext(tenant.id, (tx) =>
      markWalkover(tenant.id, staff.id, { matchId: m.id, winnerTeamId: m.homeTeamId! }, tx),
    )
    expect(row.status).toBe('walkover')
    expect(row.homeScore).toBe(3)
    expect(row.awayScore).toBe(0)
    expect(row.walkoverWinnerTeamId).toBe(m.homeTeamId)
  })

  it('en una llave el walkover necesita ganador', async () => {
    const { tenant, staff, matches } = await setup({ teams: 4, format: 'knockout' })
    const semi = matches.find((m) => m.homeTeamId !== null && m.awayTeamId !== null)!

    await expect(
      withTenantContext(tenant.id, (tx) =>
        markWalkover(tenant.id, staff.id, { matchId: semi.id, winnerTeamId: null }, tx),
      ),
    ).rejects.toThrow(WalkoverNeedsWinnerError)
  })

  it('no se marca walkover si el acta ya tiene eventos', async () => {
    const { tenant, staff, matches } = await setup({ teams: 4 })
    const m = matches[0]!
    await withTenantContext(tenant.id, (tx) =>
      addMatchEvent(
        tenant.id,
        staff.id,
        { matchId: m.id, teamId: m.homeTeamId!, type: 'goal' },
        tx,
      ),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        markWalkover(tenant.id, staff.id, { matchId: m.id, winnerTeamId: m.homeTeamId! }, tx),
      ),
    ).rejects.toThrow(WalkoverWithEventsError)
  })
})

describe('acta', () => {
  it('borrar el resultado NO borra los eventos, y recargarlo los reactiva', async () => {
    const { tenant, staff, tournamentId, matches } = await setup({ teams: 4 })
    const m = matches[0]!
    const player = await withTenantContext(tenant.id, (tx) =>
      addTeamPlayer(tenant.id, staff.id, m.homeTeamId!, { fullName: 'Diego' }, tx),
    )

    await withTenantContext(tenant.id, (tx) =>
      addMatchEvent(
        tenant.id,
        staff.id,
        { matchId: m.id, teamId: m.homeTeamId!, teamPlayerId: player.id, type: 'goal' },
        tx,
      ),
    )
    await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(tenant.id, staff.id, { matchId: m.id, homeScore: 1, awayScore: 0 }, tx),
    )

    const before = await withTenantContext(tenant.id, (tx) =>
      getTopScorers(tenant.id, tournamentId, tx),
    )
    expect(before.rows[0]?.goals).toBe(1)

    // Borrar el resultado congela el acta: el gol sigue existiendo pero no cuenta.
    await withTenantContext(tenant.id, (tx) => clearMatchResult(tenant.id, staff.id, m.id, tx))
    const frozen = await withTenantContext(tenant.id, (tx) =>
      getTopScorers(tenant.id, tournamentId, tx),
    )
    expect(frozen.rows).toHaveLength(0)
    const stillThere = await withTenantContext(tenant.id, (tx) =>
      listMatchEvents(tenant.id, m.id, tx),
    )
    expect(stillThere).toHaveLength(1)

    // Recargar el resultado lo reactiva idéntico.
    await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(tenant.id, staff.id, { matchId: m.id, homeScore: 1, awayScore: 0 }, tx),
    )
    const back = await withTenantContext(tenant.id, (tx) =>
      getTopScorers(tenant.id, tournamentId, tx),
    )
    expect(back.rows[0]?.goals).toBe(1)
  })

  it('borrar un gol lo saca de goleadores y deja el rastro en audit_logs', async () => {
    const sql = getSql()
    const { tenant, staff, tournamentId, matches } = await setup({ teams: 4 })
    const m = matches[0]!
    const player = await withTenantContext(tenant.id, (tx) =>
      addTeamPlayer(tenant.id, staff.id, m.homeTeamId!, { fullName: 'Diego' }, tx),
    )
    const ev = await withTenantContext(tenant.id, (tx) =>
      addMatchEvent(
        tenant.id,
        staff.id,
        { matchId: m.id, teamId: m.homeTeamId!, teamPlayerId: player.id, type: 'goal' },
        tx,
      ),
    )
    await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(tenant.id, staff.id, { matchId: m.id, homeScore: 1, awayScore: 0 }, tx),
    )

    await withTenantContext(tenant.id, (tx) =>
      deleteMatchEvent(tenant.id, staff.id, ev.id, tx),
    )

    const after = await withTenantContext(tenant.id, (tx) =>
      getTopScorers(tenant.id, tournamentId, tx),
    )
    expect(after.rows).toHaveLength(0)
    // El marcador sigue en 1: el gol existió, solo se perdió la atribución.
    expect(after.unattributedGoals).toBe(1)

    const logs = await sql<{ metadata: Record<string, unknown> }[]>`
      SELECT metadata FROM audit_logs
      WHERE tenant_id = ${tenant.id} AND action = 'tournament.match_event_deleted'
    `
    expect(logs).toHaveLength(1)
    expect(logs[0]!.metadata.teamPlayerId).toBe(player.id)
  })

  it('la segunda amarilla al mismo jugador en el mismo partido se rechaza', async () => {
    const { tenant, staff, matches } = await setup({ teams: 4 })
    const m = matches[0]!
    const player = await withTenantContext(tenant.id, (tx) =>
      addTeamPlayer(tenant.id, staff.id, m.homeTeamId!, { fullName: 'Diego' }, tx),
    )
    const card = {
      matchId: m.id,
      teamId: m.homeTeamId!,
      teamPlayerId: player.id,
      type: 'yellow_card' as const,
    }
    await withTenantContext(tenant.id, (tx) => addMatchEvent(tenant.id, staff.id, card, tx))

    await expect(
      withTenantContext(tenant.id, (tx) => addMatchEvent(tenant.id, staff.id, card, tx)),
    ).rejects.toThrow(DuplicateCardError)
  })

  it('borrar una amarilla des-suspende al jugador sin recálculo explícito', async () => {
    const { tenant, staff, tournamentId, matches } = await setup({ teams: 4 })
    const team = matches[0]!.homeTeamId!
    const player = await withTenantContext(tenant.id, (tx) =>
      addTeamPlayer(tenant.id, staff.id, team, { fullName: 'Diego' }, tx),
    )

    // Tres amarillas en tres partidos distintos de ese equipo = suspensión.
    const suyos = matches.filter((m) => m.homeTeamId === team || m.awayTeamId === team).slice(0, 3)
    const eventIds: string[] = []
    for (const m of suyos) {
      const ev = await withTenantContext(tenant.id, (tx) =>
        addMatchEvent(
          tenant.id,
          staff.id,
          { matchId: m.id, teamId: team, teamPlayerId: player.id, type: 'yellow_card' },
          tx,
        ),
      )
      eventIds.push(ev.id)
      await withTenantContext(tenant.id, (tx) =>
        saveMatchResult(tenant.id, staff.id, { matchId: m.id, homeScore: 1, awayScore: 0 }, tx),
      )
    }

    const suspended = await withTenantContext(tenant.id, (tx) =>
      getDisciplineBoard(tenant.id, tournamentId, tx),
    )
    expect(suspended.find((r) => r.teamPlayerId === player.id)?.yellowCards).toBe(3)

    await withTenantContext(tenant.id, (tx) =>
      deleteMatchEvent(tenant.id, staff.id, eventIds[2]!, tx),
    )
    const after = await withTenantContext(tenant.id, (tx) =>
      getDisciplineBoard(tenant.id, tournamentId, tx),
    )
    const row = after.find((r) => r.teamPlayerId === player.id)!
    expect(row.yellowCards).toBe(2)
    expect(row.pendingMatches).toBe(0)
  })
})

describe('borrados en cascada de las fases 1 y 2', () => {
  it('clearFixture con resultados cargados no tira 23503 y borra el acta', async () => {
    const { tenant, staff, tournamentId, matches } = await setup({ teams: 4 })
    const m = matches[0]!
    await withTenantContext(tenant.id, (tx) =>
      addMatchEvent(
        tenant.id,
        staff.id,
        { matchId: m.id, teamId: m.homeTeamId!, type: 'goal' },
        tx,
      ),
    )

    const { deleted } = await withTenantContext(tenant.id, (tx) =>
      clearFixture(tenant.id, staff.id, tournamentId, tx),
    )
    expect(deleted).toBe(6)
    expect(
      await withTenantContext(tenant.id, (tx) => listFixture(tenant.id, tournamentId, tx)),
    ).toHaveLength(0)
  })

  it('un jugador con goles cargados no se borra del plantel', async () => {
    const { tenant, staff, matches } = await setup({ teams: 4 })
    const m = matches[0]!
    const player = await withTenantContext(tenant.id, (tx) =>
      addTeamPlayer(tenant.id, staff.id, m.homeTeamId!, { fullName: 'Diego' }, tx),
    )
    await withTenantContext(tenant.id, (tx) =>
      addMatchEvent(
        tenant.id,
        staff.id,
        { matchId: m.id, teamId: m.homeTeamId!, teamPlayerId: player.id, type: 'goal' },
        tx,
      ),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        removeTeamPlayer(tenant.id, staff.id, player.id, tx),
      ),
    ).rejects.toThrow(TeamPlayerHasEventsError)
  })
})

describe('tabla de posiciones sobre datos reales', () => {
  it('refleja los puntos configurados y ordena por diferencia de gol', async () => {
    const { tenant, staff, tournamentId, matches, teamIds } = await setup({ teams: 4 })

    // Equipo 1 gana su primer partido 3-0.
    const first = matches.find(
      (m) => m.homeTeamId === teamIds[0] || m.awayTeamId === teamIds[0],
    )!
    const isHome = first.homeTeamId === teamIds[0]
    await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(
        tenant.id,
        staff.id,
        { matchId: first.id, homeScore: isHome ? 3 : 0, awayScore: isHome ? 0 : 3 },
        tx,
      ),
    )

    const groups = await withTenantContext(tenant.id, (tx) =>
      getStandings(tenant.id, tournamentId, tx),
    )
    expect(groups).toHaveLength(1)
    const top = groups[0]!.rows[0]!
    expect(top.teamId).toBe(teamIds[0])
    expect(top.points).toBe(3)
    expect(top.goalDiff).toBe(3)
  })
})
