/**
 * Los huecos de la Planilla: dónde puede caer un partido y por qué no puede
 * caer en el resto.
 *
 * `rescheduleMatch` (tournament-fixture.service.ts) exige tres cosas: que el
 * partido entre ENTERO dentro de una hora que el torneo posee en esa cancha,
 * que ningún equipo suyo quede con dos partidos pisados, y que la cancha no
 * termine con dos partidos encima. Las tres son invisibles desde la UI: el
 * encargado no tiene forma de saber qué horas posee el torneo, así que un
 * selector libre de fecha y hora produce `MatchOutsideOwnedTimeError` casi
 * siempre. Este módulo enumera los destinos legales para que el tablero los
 * muestre en vez de hacerlos adivinar.
 *
 * Es AFORDANCIA, NO CONTROL DE ACCESO: el service revalida las tres reglas
 * dentro de la transacción. Lo de acá puede quedar viejo entre el render y el
 * click (otro encargado moviendo partidos en otra pestaña), y para eso está el
 * error del servidor mostrado inline.
 *
 * Puro: sin DB, sin React, sin `Date.now()`. Lo importa un componente
 * `'use client'`, así que no puede arrastrar nada de servidor.
 */

import { openingsIn, type OwnedSlot, type ScheduleOptions } from './scheduler'

/**
 * Lo mínimo que este módulo necesita saber de un partido ya agendado.
 * `TournamentMatchView` lo satisface estructuralmente.
 */
export type PlacementMatch = {
  id: string
  courtId: string | null
  startsAt: Date | null
  endsAt: Date | null
  homeTeamId: string | null
  awayTeamId: string | null
  homeTeamName: string | null
  awayTeamName: string | null
}

type OpeningStatus =
  /** Libre: el partido que se está moviendo puede caer acá. */
  | 'free'
  /** Ya hay otro partido pisando este hueco en esta cancha. */
  | 'occupied'
  /** Un equipo del partido que se mueve ya juega a esa hora en otro lado. */
  | 'team_busy'
  /** Es el hueco donde el partido que se está moviendo ya está. */
  | 'current'

export type MatchOpening<S extends OwnedSlot = OwnedSlot> = {
  /** La hora poseída que contiene este hueco, tal cual la pasó el llamador. */
  slot: S
  startsAt: Date
  endsAt: Date
  status: OpeningStatus
  /** Motivo en es-AR cuando el hueco no está libre. `null` si lo está. */
  reason: string | null
  /** El partido que ocupa el hueco, si `status` es `occupied` o `current`. */
  occupiedBy: PlacementMatch | null
}

export type OpeningsInput<S extends OwnedSlot> = {
  /** Las horas que el torneo posee. Una fila de `bookings` por hora. */
  slots: readonly S[]
  /** Todos los partidos del torneo. Los que no tienen hora se ignoran. */
  matches: readonly PlacementMatch[]
  /**
   * El partido que se está moviendo, o `null` para dibujar el tablero sin
   * ningún movimiento en curso. Con `null` no hay `current` ni `team_busy`:
   * esos dos estados solo existen relativos a un partido que se mueve.
   */
  movingMatchId: string | null
  options: ScheduleOptions
}

type Interval = { start: number; end: number }

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

/** El nombre del partido para los mensajes: 'Los Pibes vs Racing'. */
function matchLabel(match: PlacementMatch): string {
  return `${match.homeTeamName ?? 'A definir'} vs ${match.awayTeamName ?? 'A definir'}`
}

function intervalOf(match: PlacementMatch): Interval | null {
  if (!match.startsAt || !match.endsAt) return null
  return { start: match.startsAt.getTime(), end: match.endsAt.getTime() }
}

/**
 * Todos los huecos del torneo, en orden cronológico y después por cancha
 * (mismo orden determinista que usa el scheduler), con el estado de cada uno
 * respecto del partido que se está moviendo.
 *
 * Con `movingMatchId: null` sirve para dibujar el tablero en reposo: cada hueco
 * sale `free` u `occupied`, que es justo lo que hace falta para renderizar la
 * grilla con sus partidos adentro.
 */
export function openingsForMatch<S extends OwnedSlot>({
  slots,
  matches,
  movingMatchId,
  options,
}: OpeningsInput<S>): Array<MatchOpening<S>> {
  const moving = movingMatchId
    ? (matches.find((m) => m.id === movingMatchId) ?? null)
    : null

  // El partido que se mueve libera su lugar: no se cuenta a sí mismo ni como
  // cancha ocupada ni como equipo ocupado. Sin esto, mover un partido 15
  // minutos dentro de la misma hora sería siempre ilegal contra sí mismo.
  const others = moving ? matches.filter((m) => m.id !== moving.id) : matches

  /** Cuándo está ocupada cada cancha. */
  const busyByCourt = new Map<string, Array<{ interval: Interval; match: PlacementMatch }>>()
  /** Cuándo está ocupado cada equipo, en cualquier cancha. */
  const busyByTeam = new Map<string, Interval[]>()

  for (const match of others) {
    const interval = intervalOf(match)
    if (!interval) continue

    if (match.courtId) {
      const list = busyByCourt.get(match.courtId) ?? []
      list.push({ interval, match })
      busyByCourt.set(match.courtId, list)
    }

    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (!teamId) continue
      const list = busyByTeam.get(teamId) ?? []
      list.push(interval)
      busyByTeam.set(teamId, list)
    }
  }

  // Los equipos del partido que se mueve, con su nombre para el mensaje. Una
  // llave sin resolver ('A definir') no tiene equipo y por lo tanto tampoco
  // puede chocar con nadie.
  const movingTeams = moving
    ? ([
        { id: moving.homeTeamId, name: moving.homeTeamName },
        { id: moving.awayTeamId, name: moving.awayTeamName },
      ].filter((t): t is { id: string; name: string | null } => t.id !== null))
    : []

  const movingAt = moving ? intervalOf(moving) : null

  const out: Array<MatchOpening<S>> = []

  for (const slot of slots) {
    for (const opening of openingsIn(slot, options)) {
      const interval = { start: opening.start.getTime(), end: opening.end.getTime() }

      // 1) ¿Es el lugar donde el partido ya está? Se compara por solapamiento y
      // no por arranque exacto: un partido movido a mano puede haber quedado
      // con un offset que no cae justo en el paso del generador.
      if (moving && movingAt && moving.courtId === slot.courtId && overlaps(interval, movingAt)) {
        out.push({
          slot,
          startsAt: opening.start,
          endsAt: opening.end,
          status: 'current',
          reason: 'El partido ya está acá.',
          occupiedBy: moving,
        })
        continue
      }

      // 2) ¿Hay otro partido pisando esta cancha a esta hora?
      const taken = (busyByCourt.get(slot.courtId) ?? []).find((b) =>
        overlaps(interval, b.interval),
      )
      if (taken) {
        out.push({
          slot,
          startsAt: opening.start,
          endsAt: opening.end,
          status: 'occupied',
          reason: `Acá juega ${matchLabel(taken.match)}.`,
          occupiedBy: taken.match,
        })
        continue
      }

      // 3) ¿Alguno de los dos equipos ya juega a esa hora en otra cancha?
      const busyTeam = movingTeams.find((team) =>
        (busyByTeam.get(team.id) ?? []).some((b) => overlaps(interval, b)),
      )
      if (busyTeam) {
        out.push({
          slot,
          startsAt: opening.start,
          endsAt: opening.end,
          status: 'team_busy',
          // Mismo texto que el error del servidor (TeamDoubleBookedError), para
          // que la afordancia y el rechazo digan lo mismo.
          reason: `${busyTeam.name ?? 'Ese equipo'} ya tiene otro partido a esa hora.`,
          occupiedBy: null,
        })
        continue
      }

      out.push({
        slot,
        startsAt: opening.start,
        endsAt: opening.end,
        status: 'free',
        reason: null,
        occupiedBy: null,
      })
    }
  }

  return out.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      a.slot.courtId.localeCompare(b.slot.courtId),
  )
}

/** Cuántos huecos libres quedan para el partido que se está moviendo. */
export function countFreeOpenings(openings: ReadonlyArray<MatchOpening>): number {
  return openings.filter((o) => o.status === 'free').length
}
