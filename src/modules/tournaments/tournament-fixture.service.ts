import { and, asc, eq, sql } from 'drizzle-orm'
import { tournamentMatches, tournamentStages } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { getTournament } from './tournament.service'
import { listTournamentSlots } from './tournament-slots.service'
import { generateRoundRobin } from './fixture/round-robin'
import { generateKnockout, type BracketMatch } from './fixture/knockout'
import { distributeIntoGroups } from './fixture/groups'
import {
  scheduleMatches,
  type OwnedSlot,
  type SchedulableMatch,
} from './fixture/scheduler'
import {
  CourtSlotTakenError,
  FixtureAlreadyExistsError,
  FixtureGenerationError,
  MatchNotFoundError,
  MatchOutsideOwnedTimeError,
  TeamDoubleBookedError,
} from './tournament.errors'
import type {
  GenerateFixtureInput,
  GenerateFixtureResult,
  TournamentMatchRow,
  TournamentMatchView,
  TournamentStageRow,
} from './tournament.types'

/** Fila cruda a insertar; el id lo pone la DB salvo que lo necesitemos antes. */
type MatchInsert = typeof tournamentMatches.$inferInsert

function rowToStage(r: typeof tournamentStages.$inferSelect): TournamentStageRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    tournamentId: r.tournamentId,
    name: r.name,
    kind: r.kind,
    orderIndex: r.orderIndex,
    legs: r.legs,
    groupsCount: r.groupsCount ?? null,
    teamsAdvancePerGroup: r.teamsAdvancePerGroup ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function rowToMatch(r: typeof tournamentMatches.$inferSelect): TournamentMatchRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    tournamentId: r.tournamentId,
    stageId: r.stageId,
    round: r.round,
    groupLabel: r.groupLabel ?? null,
    bracketSlot: r.bracketSlot ?? null,
    homeTeamId: r.homeTeamId ?? null,
    awayTeamId: r.awayTeamId ?? null,
    homeSourceMatchId: r.homeSourceMatchId ?? null,
    awaySourceMatchId: r.awaySourceMatchId ?? null,
    isThirdPlace: r.isThirdPlace,
    courtId: r.courtId ?? null,
    bookingId: r.bookingId ?? null,
    startsAt: r.startsAt ?? null,
    endsAt: r.endsAt ?? null,
    status: r.status,
    homeScore: r.homeScore ?? null,
    awayScore: r.awayScore ?? null,
    homePenalties: r.homePenalties ?? null,
    awayPenalties: r.awayPenalties ?? null,
    walkoverWinnerTeamId: r.walkoverWinnerTeamId ?? null,
    homeSourceSeed: r.homeSourceSeed ?? null,
    awaySourceSeed: r.awaySourceSeed ?? null,
    playedAt: r.playedAt ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

/** Equipos que siguen en carrera, en orden de siembra y después por nombre. */
async function activeTeamIds(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<string[]> {
  const rows = (await tx.execute(sql`
    SELECT id FROM tournament_teams
    WHERE tenant_id = ${tenantId}
      AND tournament_id = ${tournamentId}
      AND status IN ('registered', 'confirmed')
    ORDER BY seed NULLS LAST, lower(trim(name))
  `)) as unknown as Array<{ id: string }>
  return rows.map((r) => r.id)
}

export async function countMatches(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT count(*)::int AS "count" FROM tournament_matches
    WHERE tenant_id = ${tenantId} AND tournament_id = ${tournamentId}
  `)) as unknown as Array<{ count: number }>
  return rows[0]?.count ?? 0
}

/**
 * Genera el fixture completo y lo persiste.
 *
 * El motor puro (fixture/) devuelve cruces con ÍNDICES; acá se insertan las
 * filas y se traducen esos índices a UUIDs reales en un segundo paso, porque el
 * avance automático de las llaves necesita el id del partido anterior.
 *
 * El resultado es una PROPUESTA editable: cada partido se puede mover después
 * con `rescheduleMatch`.
 */
export async function generateFixture(
  tenantId: string,
  staffUserId: string,
  tournamentId: string,
  input: GenerateFixtureInput,
  tx: DbTx,
): Promise<GenerateFixtureResult> {
  const tournament = await getTournament(tenantId, tournamentId, tx)

  const existing = await countMatches(tenantId, tournamentId, tx)
  if (existing > 0) throw new FixtureAlreadyExistsError(existing)

  const teamIds = await activeTeamIds(tenantId, tournamentId, tx)
  if (teamIds.length < 2) {
    throw new FixtureGenerationError(
      'Hacen falta al menos 2 equipos anotados para armar el fixture.',
    )
  }

  const legs = input.legs ?? 1
  const stageRows: Array<typeof tournamentStages.$inferInsert> = []
  /** Partidos por fase, todavía con índices relativos al bracket. */
  const plan: Array<{
    stageIndex: number
    round: number
    groupLabel: string | null
    bracketSlot: number | null
    homeTeamId: string | null
    awayTeamId: string | null
    homeSourceLocal: number | null
    awaySourceLocal: number | null
    /** Puesto de zona del que sale cada lado (1-based). Solo groups_playoff. */
    homeSourceSeed: number | null
    awaySourceSeed: number | null
    isThirdPlace: boolean
    /** Índice local dentro de la fase, al que apuntan los `*SourceLocal`. */
    localIndex: number
  }> = []

  /**
 * '__q0__' -> 1. Los genera la rama de groups_playoff más abajo; también
 * aparecen como homeTeamId en las rondas con BYE.
 */
function seedOfPlaceholder(id: string | null): number | null {
  if (id === null || !id.startsWith('__q')) return null
  const n = Number(id.slice(3, -2))
  return Number.isFinite(n) ? n + 1 : null
}

/** Empuja un bracket de llaves respetando sus índices locales. */
  function pushBracket(stageIndex: number, bracket: BracketMatch[]): void {
    for (const m of bracket) {
      plan.push({
        stageIndex,
        round: m.round,
        groupLabel: null,
        bracketSlot: m.slot,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeSourceLocal: m.homeSourceIndex,
        awaySourceLocal: m.awaySourceIndex,
        homeSourceSeed: null,
        awaySourceSeed: null,
        isThirdPlace: m.isThirdPlace ?? false,
        localIndex: m.index,
      })
    }
  }

  if (tournament.format === 'league') {
    stageRows.push({
      tenantId,
      tournamentId,
      name: legs === 2 ? 'Liga (ida y vuelta)' : 'Liga',
      kind: 'league',
      orderIndex: 0,
      legs,
    })
    let local = 0
    for (const round of generateRoundRobin(teamIds, { legs })) {
      for (const p of round.pairings) {
        plan.push({
          stageIndex: 0,
          round: round.round,
          groupLabel: null,
          bracketSlot: null,
          homeTeamId: p.homeTeamId,
          awayTeamId: p.awayTeamId,
          homeSourceLocal: null,
          awaySourceLocal: null,
          homeSourceSeed: null,
          awaySourceSeed: null,
          isThirdPlace: false,
          localIndex: local++,
        })
      }
    }
  } else if (tournament.format === 'knockout') {
    stageRows.push({
      tenantId,
      tournamentId,
      name: 'Eliminación directa',
      kind: 'knockout',
      orderIndex: 0,
      legs: 1,
    })
    pushBracket(0, generateKnockout(teamIds, { thirdPlace: input.thirdPlace }))
  } else {
    // groups_playoff: zonas y después cruces.
    const groupsCount = input.groupsCount ?? 2
    const advance = input.teamsAdvancePerGroup ?? 2
    const groups = distributeIntoGroups(teamIds, groupsCount)

    stageRows.push({
      tenantId,
      tournamentId,
      name: 'Fase de grupos',
      kind: 'group_stage',
      orderIndex: 0,
      legs,
      groupsCount,
      teamsAdvancePerGroup: advance,
    })

    // La zona de cada equipo se persiste: la 062 dejó la columna en NULL y sin
    // esto la ficha del equipo no sabe en qué zona juega.
    for (const group of groups) {
      for (const teamId of group.teamIds) {
        await tx.execute(sql`
          UPDATE tournament_teams SET group_label = ${group.label}
          WHERE id = ${teamId} AND tenant_id = ${tenantId}
        `)
      }
    }

    let local = 0
    for (const group of groups) {
      for (const round of generateRoundRobin(group.teamIds, { legs })) {
        for (const p of round.pairings) {
          plan.push({
            stageIndex: 0,
            round: round.round,
            groupLabel: group.label,
            bracketSlot: null,
            homeTeamId: p.homeTeamId,
            awayTeamId: p.awayTeamId,
            homeSourceLocal: null,
            awaySourceLocal: null,
            homeSourceSeed: null,
            awaySourceSeed: null,
            isThirdPlace: false,
            localIndex: local++,
          })
        }
      }
    }

    // Playoffs: el cuadro nace vacío. Los clasificados se resuelven al cerrar
    // las zonas (fase 3), así que acá van placeholders sin equipo.
    const qualified = groupsCount * advance
    if (qualified >= 2) {
      stageRows.push({
        tenantId,
        tournamentId,
        name: 'Playoffs',
        kind: 'knockout',
        orderIndex: 1,
        legs: 1,
      })
      const placeholders = Array.from({ length: qualified }, (_, i) => `__q${i}__`)
      const bracket = generateKnockout(placeholders, { thirdPlace: input.thirdPlace })
      for (const m of bracket) {
        plan.push({
          stageIndex: 1,
          // `round` es local a la fase: la ronda 1 de los playoffs y la fecha 1
          // de la zona son las dos 1. Lo que las separa en el tiempo es el
          // `stageOrder` que se le pasa al scheduler, NO un corrimiento del
          // número de ronda — que además rompería el "Semifinal" de la UI.
          round: m.round,
          groupLabel: null,
          bracketSlot: m.slot,
          // Los placeholders no son equipos reales: el cuadro arranca sin dueño.
          homeTeamId: null,
          awayTeamId: null,
          homeSourceLocal: m.homeSourceIndex,
          awaySourceLocal: m.awaySourceIndex,
          // ...pero QUÉ puesto de zona va en cada slot no se puede perder, o
          // después no hay forma de sembrar el cuadro desde la tabla.
          homeSourceSeed: seedOfPlaceholder(m.homeTeamId),
          awaySourceSeed: seedOfPlaceholder(m.awayTeamId),
          isThirdPlace: m.isThirdPlace ?? false,
          localIndex: m.index,
        })
      }
    }
  }

  // ── Persistir fases ──────────────────────────────────────────
  const insertedStages = await tx.insert(tournamentStages).values(stageRows).returning()
  const stageIdByIndex = insertedStages
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((s) => s.id)

  // ── Persistir partidos ───────────────────────────────────────
  // Los UUIDs se generan ACÁ, no en la DB. Con el id conocido de antemano, el
  // avance de llaves (home/away_source_match_id) se resuelve en el MISMO
  // INSERT. La alternativa —insertar y después mapear por la posición de
  // `returning()`— apoyaría el cableado del cuadro en un orden que Postgres NO
  // garantiza para un INSERT multi-fila: si algún día no coincidiera, la
  // semifinal apuntaría al partido equivocado y fallaría en silencio.
  // `gen_random_uuid()` es solo el DEFAULT de la columna: acepta un valor
  // explícito.
  const idByStageAndLocal = new Map<string, string>()
  for (const p of plan) {
    idByStageAndLocal.set(`${p.stageIndex}:${p.localIndex}`, crypto.randomUUID())
  }
  const idOf = (stageIndex: number, local: number | null): string | null =>
    local === null ? null : (idByStageAndLocal.get(`${stageIndex}:${local}`) ?? null)

  const rows: MatchInsert[] = plan.map((p) => ({
    id: idOf(p.stageIndex, p.localIndex)!,
    tenantId,
    tournamentId,
    stageId: stageIdByIndex[p.stageIndex]!,
    round: p.round,
    groupLabel: p.groupLabel,
    bracketSlot: p.bracketSlot,
    homeTeamId: p.homeTeamId,
    awayTeamId: p.awayTeamId,
    homeSourceMatchId: idOf(p.stageIndex, p.homeSourceLocal),
    awaySourceMatchId: idOf(p.stageIndex, p.awaySourceLocal),
    homeSourceSeed: p.homeSourceSeed,
    awaySourceSeed: p.awaySourceSeed,
    isThirdPlace: p.isThirdPlace,
  }))
  const insertedMatches = await tx.insert(tournamentMatches).values(rows).returning()

  // ── Agendado dentro de las horas que el torneo posee ─────────
  let unscheduled = 0
  if (input.autoSchedule !== false) {
    const slots = await listTournamentSlots(tenantId, tournamentId, tx)
    const owned: OwnedSlot[] = slots.map((s) => ({
      bookingId: s.bookingId,
      courtId: s.courtId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    }))

    // Se arma desde `plan` y no desde las filas insertadas porque ahí está el
    // stageIndex, que es lo que evita que los playoffs se agenden mezclados
    // con las fechas de zona (las dos empiezan en round = 1).
    const schedulable: SchedulableMatch[] = plan.map((p) => ({
      ref: idOf(p.stageIndex, p.localIndex)!,
      stageOrder: p.stageIndex,
      round: p.round,
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
    }))

    const result = scheduleMatches(schedulable, owned, {
      matchDurationMinutes: tournament.matchDurationMinutes,
      restBetweenMatchesMinutes: tournament.restBetweenMatchesMinutes,
    })
    unscheduled = result.unscheduled.length

    for (const s of result.scheduled) {
      await tx
        .update(tournamentMatches)
        .set({
          bookingId: s.bookingId,
          courtId: s.courtId,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
        })
        .where(eq(tournamentMatches.id, s.ref))
    }
  }

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.fixture_generated',
    resourceType: 'tournament',
    resourceId: tournamentId,
    metadata: {
      format: tournament.format,
      stages: insertedStages.length,
      matches: insertedMatches.length,
      unscheduled,
      teams: teamIds.length,
    },
  })

  return {
    stages: insertedStages.length,
    matches: insertedMatches.length,
    unscheduled,
  }
}

/** Borra el fixture entero. Hijos antes que padres. */
export async function clearFixture(
  tenantId: string,
  staffUserId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<{ deleted: number }> {
  // El acta (migr. 065) es hija de los partidos: va primero, o regenerar el
  // fixture de un torneo con un solo gol cargado muere con un 23503 crudo.
  const wiped = (await tx.execute(sql`
    DELETE FROM tournament_match_events
    WHERE tenant_id = ${tenantId} AND tournament_id = ${tournamentId}
    RETURNING id
  `)) as unknown as unknown[]

  // Los partidos se referencian entre sí (avance de llaves): cortar los
  // punteros antes de borrar, o la FK frena.
  await tx.execute(sql`
    UPDATE tournament_matches
    SET home_source_match_id = NULL, away_source_match_id = NULL
    WHERE tenant_id = ${tenantId} AND tournament_id = ${tournamentId}
  `)
  const deleted = (await tx.execute(sql`
    DELETE FROM tournament_matches
    WHERE tenant_id = ${tenantId} AND tournament_id = ${tournamentId}
    RETURNING id
  `)) as unknown as unknown[]
  await tx.execute(sql`
    DELETE FROM tournament_stages
    WHERE tenant_id = ${tenantId} AND tournament_id = ${tournamentId}
  `)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.fixture_cleared',
    resourceType: 'tournament',
    resourceId: tournamentId,
    metadata: { deleted: deleted.length, deletedEvents: wiped.length },
  })

  return { deleted: deleted.length }
}

export async function listStages(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<TournamentStageRow[]> {
  const rows = await tx
    .select()
    .from(tournamentStages)
    .where(
      and(
        eq(tournamentStages.tenantId, tenantId),
        eq(tournamentStages.tournamentId, tournamentId),
      ),
    )
    .orderBy(asc(tournamentStages.orderIndex))
  return rows.map(rowToStage)
}

/** Partidos con nombres de equipo y cancha ya resueltos, listos para la UI. */
export async function listFixture(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<TournamentMatchView[]> {
  const rows = (await tx.execute(sql`
    SELECT m.*,
           h.name AS "homeTeamName",
           a.name AS "awayTeamName",
           c.name AS "courtName"
    FROM tournament_matches m
    LEFT JOIN tournament_teams h ON h.id = m.home_team_id
    LEFT JOIN tournament_teams a ON a.id = m.away_team_id
    LEFT JOIN courts c           ON c.id = m.court_id
    WHERE m.tenant_id = ${tenantId} AND m.tournament_id = ${tournamentId}
    ORDER BY m.round, m.bracket_slot NULLS LAST, m.starts_at NULLS LAST, m.id
  `)) as unknown as Array<Record<string, unknown>>

  return rows.map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    tournamentId: r.tournament_id as string,
    stageId: r.stage_id as string,
    round: r.round as number,
    groupLabel: (r.group_label as string | null) ?? null,
    bracketSlot: (r.bracket_slot as number | null) ?? null,
    homeTeamId: (r.home_team_id as string | null) ?? null,
    awayTeamId: (r.away_team_id as string | null) ?? null,
    homeSourceMatchId: (r.home_source_match_id as string | null) ?? null,
    awaySourceMatchId: (r.away_source_match_id as string | null) ?? null,
    isThirdPlace: r.is_third_place as boolean,
    courtId: (r.court_id as string | null) ?? null,
    bookingId: (r.booking_id as string | null) ?? null,
    startsAt: r.starts_at ? new Date(r.starts_at as string) : null,
    endsAt: r.ends_at ? new Date(r.ends_at as string) : null,
    status: r.status as TournamentMatchRow['status'],
    homeScore: (r.home_score as number | null) ?? null,
    awayScore: (r.away_score as number | null) ?? null,
    homePenalties: (r.home_penalties as number | null) ?? null,
    awayPenalties: (r.away_penalties as number | null) ?? null,
    walkoverWinnerTeamId: (r.walkover_winner_team_id as string | null) ?? null,
    homeSourceSeed: (r.home_source_seed as number | null) ?? null,
    awaySourceSeed: (r.away_source_seed as number | null) ?? null,
    playedAt: r.played_at ? new Date(r.played_at as string) : null,
    notes: (r.notes as string | null) ?? null,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
    homeTeamName: (r.homeTeamName as string | null) ?? null,
    awayTeamName: (r.awayTeamName as string | null) ?? null,
    courtName: (r.courtName as string | null) ?? null,
  }))
}

/**
 * Mueve un partido a otra hora/cancha.
 *
 * El fixture generado es una propuesta: esto es lo que la vuelve editable.
 * Valida las tres reglas que el scheduler ya respeta, porque acá el admin puede
 * pedir cualquier cosa: que el partido caiga dentro de una hora que el torneo
 * posee, que ningún equipo quede con dos partidos pisados, y que la cancha no
 * termine con dos partidos encima.
 */
export async function rescheduleMatch(
  tenantId: string,
  staffUserId: string,
  matchId: string,
  startsAt: Date,
  courtId: string,
  tx: DbTx,
): Promise<TournamentMatchRow> {
  const found = await tx
    .select()
    .from(tournamentMatches)
    .where(and(eq(tournamentMatches.id, matchId), eq(tournamentMatches.tenantId, tenantId)))
    .limit(1)
  const match = found[0]
  if (!match) throw new MatchNotFoundError(matchId)

  const tournament = await getTournament(tenantId, match.tournamentId, tx)
  const endsAt = new Date(
    startsAt.getTime() + tournament.matchDurationMinutes * 60_000,
  )

  // 1) Tiene que caber ENTERO en una hora que el torneo posee, en esa cancha.
  const containing = (await tx.execute(sql`
    SELECT id FROM bookings
    WHERE tenant_id = ${tenantId}
      AND tournament_id = ${match.tournamentId}
      AND court_id = ${courtId}
      AND status IN ('confirmed', 'pending_payment')
      AND starts_at <= ${startsAt.toISOString()}
      AND ends_at   >= ${endsAt.toISOString()}
    LIMIT 1
  `)) as unknown as Array<{ id: string }>
  const booking = containing[0]
  if (!booking) throw new MatchOutsideOwnedTimeError()

  // 2) Ningún equipo del partido puede estar jugando otro a esa hora.
  const teamIds = [match.homeTeamId, match.awayTeamId].filter(
    (t): t is string => t !== null,
  )
  if (teamIds.length > 0) {
    const idList = sql.join(
      teamIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )
    const clash = (await tx.execute(sql`
      SELECT t.name
      FROM tournament_matches m
      JOIN tournament_teams t
        ON t.id = m.home_team_id OR t.id = m.away_team_id
      WHERE m.tenant_id = ${tenantId}
        AND m.id <> ${matchId}
        AND m.starts_at IS NOT NULL
        AND t.id = ANY(ARRAY[${idList}])
        AND tstzrange(m.starts_at, m.ends_at) && tstzrange(${startsAt.toISOString()}, ${endsAt.toISOString()})
      LIMIT 1
    `)) as unknown as Array<{ name: string }>
    if (clash[0]) throw new TeamDoubleBookedError(clash[0].name)
  }

  // 3) La cancha tampoco puede quedar con dos partidos encima. El generador
  // reparte un partido por hueco, pero acá el admin elige a mano: sin esto,
  // arrastrar un partido produce un estado que el fixture nunca produciría.
  // La hora es del torneo (chequeado arriba), así que alcanza con mirar los
  // partidos: el exclusion constraint de bookings ya evita que dos torneos
  // posean la misma cancha a la misma hora.
  const courtBusy = (await tx.execute(sql`
    SELECT 1 AS taken
    FROM tournament_matches m
    WHERE m.tenant_id = ${tenantId}
      AND m.id <> ${matchId}
      AND m.court_id = ${courtId}
      AND m.starts_at IS NOT NULL
      AND tstzrange(m.starts_at, m.ends_at) && tstzrange(${startsAt.toISOString()}, ${endsAt.toISOString()})
    LIMIT 1
  `)) as unknown as Array<{ taken: number }>
  if (courtBusy[0]) throw new CourtSlotTakenError()

  const updated = await tx
    .update(tournamentMatches)
    .set({ startsAt, endsAt, courtId, bookingId: booking.id })
    .where(and(eq(tournamentMatches.id, matchId), eq(tournamentMatches.tenantId, tenantId)))
    .returning()

  const row = updated[0]
  if (!row) throw new MatchNotFoundError(matchId)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.match_rescheduled',
    resourceType: 'tournament_match',
    resourceId: matchId,
    metadata: { startsAt: startsAt.toISOString(), courtId },
  })

  return rowToMatch(row)
}
