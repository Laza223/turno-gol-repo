/**
 * Disciplina: amarillas acumuladas y expulsiones.
 *
 * También derivado, no materializado: borrar una amarilla cargada por error
 * tiene que des-suspender al jugador sin ningún recálculo explícito.
 */
import { matchCounts } from './standings'
import type { StandingsEvent, StandingsMatch } from './types'

/**
 * La amarilla del mismo partido en que el jugador vio la roja no acumula para
 * la próxima suspensión (sí cuenta para fair play). En fútbol la 2da amarilla
 * ES la roja, así que contar las dos sería contar la misma expulsión dos veces.
 *
 * DECIDIDO (dueño, 2026-08-05): se CONFIRMA este comportamiento. Estuvo marcado
 * como "REQUIERE INPUT antes de release" porque hay ligas amateur que cuentan
 * las dos tarjetas por separado — se evaluó y se descartó a propósito, no es un
 * olvido. Ver `docs/decisions/2026-08-05-amarilla-consumida-por-roja.md`.
 *
 * Bajo test: `tests/unit/tournament-suspensions.test.ts`, describe
 * "computeSuspensions — amarilla del partido de la roja" (asserta
 * `pendingMatches === 1`, no 2). Ese test se pone rojo si alguien invierte esta
 * constante sin pasar por el ADR.
 */
const YELLOWS_CONSUMED_BY_RED = true

export type SuspensionRow = {
  teamPlayerId: string
  teamId: string
  yellowCards: number
  redCards: number
  /** Amarillas desde el último corte (arrastra el excedente). */
  yellowsTowardNext: number
  /** Fechas que todavía debe. 0 = habilitado. */
  pendingMatches: number
  servedMatches: number
  /** Próximos partidos del equipo que se pierde (proyección). */
  suspendedMatchIds: string[]
  reason: 'yellow_accumulation' | 'red_card' | null
  /** Evento que disparó la sanción vigente: la UI linkea al acta. */
  triggerEventId: string | null
}

export type SuspensionsInput = {
  matches: readonly StandingsMatch[]
  events: readonly StandingsEvent[]
  config: { yellowCardsForSuspension: number; redCardSuspensionMatches: number }
}

/**
 * Orden cronológico canónico, total y determinista incluso con el fixture sin
 * agendar. `round` va ANTES que `startsAt` a propósito: con un fixture
 * parcialmente agendado, ordenar por fecha mandaría la fecha 1 sin horario
 * después de la fecha 2 ya agendada.
 */
function chronological(a: StandingsMatch, b: StandingsMatch): number {
  if (a.stageOrderIndex !== b.stageOrderIndex) return a.stageOrderIndex - b.stageOrderIndex
  if (a.round !== b.round) return a.round - b.round
  const ta = a.startsAt?.getTime() ?? Number.POSITIVE_INFINITY
  const tb = b.startsAt?.getTime() ?? Number.POSITIVE_INFINITY
  if (ta !== tb) return ta - tb
  const sa = a.bracketSlot ?? Number.POSITIVE_INFINITY
  const sb = b.bracketSlot ?? Number.POSITIVE_INFINITY
  if (sa !== sb) return sa - sb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function computeSuspensions(input: SuspensionsInput): SuspensionRow[] {
  const { yellowCardsForSuspension, redCardSuspensionMatches } = input.config
  const ordered = [...input.matches].sort(chronological)

  const eventsByMatch = new Map<string, StandingsEvent[]>()
  for (const ev of input.events) {
    const list = eventsByMatch.get(ev.matchId) ?? []
    list.push(ev)
    eventsByMatch.set(ev.matchId, list)
  }

  const rows = new Map<string, SuspensionRow>()
  const rowFor = (teamPlayerId: string, teamId: string): SuspensionRow => {
    const existing = rows.get(teamPlayerId)
    if (existing) return existing
    const created: SuspensionRow = {
      teamPlayerId,
      teamId,
      yellowCards: 0,
      redCards: 0,
      yellowsTowardNext: 0,
      pendingMatches: 0,
      servedMatches: 0,
      suspendedMatchIds: [],
      reason: null,
      triggerEventId: null,
    }
    rows.set(teamPlayerId, created)
    return created
  }

  // Pase 1 — cronológico, solo partidos computables.
  for (const m of ordered) {
    if (!matchCounts(m)) continue
    const evs = eventsByMatch.get(m.id) ?? []

    for (const teamId of [m.homeTeamId!, m.awayTeamId!]) {
      // CUMPLIR primero: un expulsado no cumple la fecha en el partido en el
      // que lo echaron.
      for (const row of rows.values()) {
        if (row.teamId === teamId && row.pendingMatches > 0) {
          row.pendingMatches -= 1
          row.servedMatches += 1
        }
      }

      // ACUMULAR después.
      const teamEvents = evs.filter((e) => e.teamId === teamId && e.teamPlayerId !== null)
      const redsHere = new Set(
        teamEvents.filter((e) => e.type === 'red_card').map((e) => e.teamPlayerId!),
      )

      for (const ev of teamEvents) {
        const playerId = ev.teamPlayerId!
        const row = rowFor(playerId, teamId)

        if (ev.type === 'red_card') {
          row.redCards += 1
          const fechas = ev.suspensionMatches ?? redCardSuspensionMatches
          if (fechas > 0) {
            row.pendingMatches += fechas
            row.reason = 'red_card'
            row.triggerEventId = ev.id
          }
          continue
        }

        if (ev.type !== 'yellow_card') continue
        row.yellowCards += 1
        if (YELLOWS_CONSUMED_BY_RED && redsHere.has(playerId)) continue
        row.yellowsTowardNext += 1
        if (
          yellowCardsForSuspension > 0 &&
          row.yellowsTowardNext >= yellowCardsForSuspension
        ) {
          row.pendingMatches += 1
          row.yellowsTowardNext -= yellowCardsForSuspension
          row.reason = 'yellow_accumulation'
          row.triggerEventId = ev.id
        }
      }
    }
  }

  // Pase 2 — proyección sobre los próximos partidos programados del equipo.
  // Los 'postponed' no se usan: si terminan cancelándose, la UI habría
  // anunciado una suspensión en un partido que no existió.
  for (const row of rows.values()) {
    if (row.pendingMatches <= 0) continue
    const upcoming = ordered.filter(
      (m) =>
        m.status === 'scheduled' && (m.homeTeamId === row.teamId || m.awayTeamId === row.teamId),
    )
    row.suspendedMatchIds = upcoming.slice(0, row.pendingMatches).map((m) => m.id)
  }

  return [...rows.values()]
}
