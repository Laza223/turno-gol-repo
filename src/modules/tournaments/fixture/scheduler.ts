/**
 * Agendado de partidos DENTRO de las horas que el torneo ya posee.
 *
 * Esta es la pieza que hace que el modelo de dos niveles cierre: el torneo
 * reservó horas enteras en la grilla (filas de `bookings`), y acá se reparten
 * los partidos adentro de esas horas. Un partido NO crea una reserva — consume
 * tiempo ya reservado. Por eso un relámpago de partidos de 25 minutos entra sin
 * romper el turno de 60 minutos fijo del producto.
 *
 * Restricciones que respeta:
 *  - Un partido entero tiene que caber dentro de una hora poseída.
 *  - Un equipo no puede jugar dos partidos que se pisen, en ninguna cancha.
 *  - Una ronda no arranca hasta que terminó la anterior. En una liga eso es
 *    "la fecha 2 va después de la fecha 1"; en llaves es obligatorio, porque el
 *    ganador de la ronda anterior es uno de los participantes.
 *
 * Puro: recibe las horas ya resueltas y devuelve asignaciones. Sin DB.
 */

export type OwnedSlot = {
  /** La reserva del torneo que cubre esta hora. */
  bookingId: string
  courtId: string
  startsAt: Date
  endsAt: Date
}

/** Lo mínimo que el scheduler necesita saber de un partido. */
export type SchedulableMatch = {
  /** Identificador estable del llamador (índice del bracket o UUID). */
  ref: string
  /**
   * Orden de la FASE a la que pertenece (tournament_stages.order_index).
   * Hace falta porque `round` es local a su fase: la fecha 1 de la zona y la
   * ronda 1 de los playoffs son las dos `round = 1`, y sin esto el scheduler
   * las trataría como la misma → la semifinal podría quedar agendada antes de
   * que se jueguen las zonas. Los partidos de playoffs nacen sin equipos, así
   * que la restricción de "un equipo no juega dos veces" tampoco lo frenaría.
   *
   * Opcional y default 0: un torneo de una sola fase no necesita pensarlo.
   */
  stageOrder?: number
  round: number
  /** null cuando todavía no se sabe quién juega (llave sin resolver). */
  homeTeamId: string | null
  awayTeamId: string | null
}

type ScheduledMatch = {
  ref: string
  bookingId: string
  courtId: string
  startsAt: Date
  endsAt: Date
}

export type ScheduleOptions = {
  matchDurationMinutes: number
  /** Recambio entre dos partidos consecutivos en la misma hora y cancha. */
  restBetweenMatchesMinutes?: number
}

export type ScheduleResult = {
  scheduled: ScheduledMatch[]
  /** Partidos que no entraron. NUNCA se agenda a medias en silencio. */
  unscheduled: SchedulableMatch[]
}

const MS_PER_MIN = 60_000

type Placement = { start: Date; end: Date }

/** Posiciones donde arrancaría un partido dentro de una hora poseída. */
function placementsIn(slot: OwnedSlot, durationMs: number, stepMs: number): Placement[] {
  const out: Placement[] = []
  for (let t = slot.startsAt.getTime(); t + durationMs <= slot.endsAt.getTime(); t += stepMs) {
    out.push({ start: new Date(t), end: new Date(t + durationMs) })
  }
  return out
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function scheduleMatches(
  matches: readonly SchedulableMatch[],
  slots: readonly OwnedSlot[],
  opts: ScheduleOptions,
): ScheduleResult {
  const durationMs = opts.matchDurationMinutes * MS_PER_MIN
  const restMs = (opts.restBetweenMatchesMinutes ?? 0) * MS_PER_MIN
  // El paso incluye el recambio: dos partidos seguidos en la misma cancha no
  // arrancan pegados.
  const stepMs = durationMs + restMs

  // Huecos disponibles, ordenados cronológicamente y después por cancha, para
  // que el reparto sea determinista (importa: el fixture se regenera igual).
  const openings = slots
    .flatMap((slot) =>
      placementsIn(slot, durationMs, stepMs).map((p) => ({ slot, ...p })),
    )
    .sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() || a.slot.courtId.localeCompare(b.slot.courtId),
    )

  /** Huecos ya usados: un hueco no recibe dos partidos. */
  const taken = new Set<number>()
  /** Cuándo está ocupado cada equipo, para no duplicarlo. */
  const busyByTeam = new Map<string, Array<{ start: number; end: number }>>()

  const scheduled: ScheduledMatch[] = []
  const unscheduled: SchedulableMatch[] = []

  // Por fase y después por ronda: hasta que no termina una, no arranca la
  // siguiente. `round` es local a su fase, así que ordenar solo por round
  // mezclaría la fecha 1 de la zona con la ronda 1 de los playoffs.
  const ordered = [...matches].sort(
    (a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0) || a.round - b.round,
  )
  let floor = 0 // instante más temprano permitido para el bloque actual
  let currentStage = ordered[0]?.stageOrder ?? 0
  let currentRound = ordered[0]?.round ?? 0
  let blockMaxEnd = 0

  for (const match of ordered) {
    const stage = match.stageOrder ?? 0
    if (stage !== currentStage || match.round !== currentRound) {
      // Cambió la fase o la ronda: el piso pasa a ser el final del bloque
      // anterior.
      floor = blockMaxEnd
      currentStage = stage
      currentRound = match.round
    }

    const teams = [match.homeTeamId, match.awayTeamId].filter(
      (t): t is string => t !== null,
    )

    let placed: ScheduledMatch | null = null

    for (let i = 0; i < openings.length; i++) {
      if (taken.has(i)) continue
      const opening = openings[i]!
      if (opening.start.getTime() < floor) continue

      const start = opening.start.getTime()
      const end = opening.end.getTime()

      // Ningún equipo del partido puede estar ocupado en esa franja.
      const clash = teams.some((teamId) =>
        (busyByTeam.get(teamId) ?? []).some((b) => overlaps(start, end, b.start, b.end)),
      )
      if (clash) continue

      taken.add(i)
      for (const teamId of teams) {
        const list = busyByTeam.get(teamId) ?? []
        list.push({ start, end })
        busyByTeam.set(teamId, list)
      }
      placed = {
        ref: match.ref,
        bookingId: opening.slot.bookingId,
        courtId: opening.slot.courtId,
        startsAt: opening.start,
        endsAt: opening.end,
      }
      break
    }

    if (placed) {
      scheduled.push(placed)
      blockMaxEnd = Math.max(blockMaxEnd, placed.endsAt.getTime())
    } else {
      unscheduled.push(match)
    }
  }

  return { scheduled, unscheduled }
}

/**
 * Cuántos partidos entran en las horas dadas, ignorando las restricciones de
 * equipos. Sirve para avisar ANTES de generar que no va a alcanzar.
 */
export function slotCapacity(
  slots: readonly OwnedSlot[],
  opts: ScheduleOptions,
): number {
  const durationMs = opts.matchDurationMinutes * MS_PER_MIN
  const stepMs = durationMs + (opts.restBetweenMatchesMinutes ?? 0) * MS_PER_MIN
  return slots.reduce((acc, s) => acc + placementsIn(s, durationMs, stepMs).length, 0)
}
