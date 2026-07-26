import { FixtureGenerationError } from '../tournament.errors'

/**
 * Llaves de eliminación directa.
 *
 * El bracket se arma del tamaño de la potencia de 2 que alcanza; los equipos
 * sobrantes reciben BYE en la primera ronda. Un partido de ronda N se alimenta
 * de los GANADORES de dos partidos de la ronda N-1, y eso se expresa con
 * `homeSourceIndex` / `awaySourceIndex` apuntando a la posición del partido en
 * el array devuelto — el service traduce esos índices a UUIDs al insertar.
 *
 * Puro: sin fechas, canchas ni DB.
 */

export type BracketMatch = {
  /** Posición en el array devuelto. Es a lo que apuntan los `*SourceIndex`. */
  index: number
  /** 1 = primera ronda que se juega. La última es la final. */
  round: number
  /** Posición dentro de la ronda, de arriba hacia abajo del cuadro. */
  slot: number
  /** Equipo ya conocido, o null si sale de un partido anterior. */
  homeTeamId: string | null
  awayTeamId: string | null
  /** Índice del partido cuyo GANADOR juega de local acá. */
  homeSourceIndex: number | null
  awaySourceIndex: number | null
  /** Partido por el tercer puesto (se alimenta de los PERDEDORES de la semi). */
  isThirdPlace?: boolean
}

export type KnockoutOptions = {
  /** Agrega el partido por el 3er puesto (solo si hay semifinales). */
  thirdPlace?: boolean
}

const MAX_TEAMS = 64

/** Potencia de 2 igual o mayor a n. */
function bracketSize(n: number): number {
  let size = 1
  while (size < n) size *= 2
  return size
}

/**
 * Orden de siembra estándar: enfrenta al 1 con el último, al 2 con el anteúltimo,
 * etc., de forma recursiva, para que los mejores se crucen lo más tarde posible.
 * Devuelve las posiciones (1-based) en el orden en que van al cuadro.
 */
function seedOrder(size: number): number[] {
  let order = [1, 2]
  while (order.length < size) {
    const next = order.length * 2 + 1
    const expanded: number[] = []
    for (const s of order) {
      expanded.push(s, next - s)
    }
    order = expanded
  }
  return order
}

export function generateKnockout(
  teamIds: readonly string[],
  opts: KnockoutOptions = {},
): BracketMatch[] {
  if (teamIds.length < 2) {
    throw new FixtureGenerationError('Hacen falta al menos 2 equipos para armar las llaves.')
  }
  if (teamIds.length > MAX_TEAMS) {
    throw new FixtureGenerationError(`No se pueden armar llaves de más de ${MAX_TEAMS} equipos.`)
  }
  if (new Set(teamIds).size !== teamIds.length) {
    throw new FixtureGenerationError('Hay equipos repetidos en la lista.')
  }

  const size = bracketSize(teamIds.length)
  const totalRounds = Math.log2(size)

  // Cuadro completo con huecos: la posición i del sorteo recibe al equipo
  // sembrado i, o null si ese número no existe (ese rival tiene BYE).
  const draw = seedOrder(size).map((seed) => teamIds[seed - 1] ?? null)

  const matches: BracketMatch[] = []
  /**
   * Para cada posición de la ronda siguiente: de dónde sale ese participante.
   * O es un equipo directo (BYE: pasó sin jugar) o el ganador de un partido.
   */
  let feeders: Array<
    { kind: 'team'; teamId: string } | { kind: 'winner'; index: number } | null
  > = []

  // ── Primera ronda ──────────────────────────────────────────────
  for (let i = 0; i < size / 2; i++) {
    const home = draw[i * 2] ?? null
    const away = draw[i * 2 + 1] ?? null

    if (home && away) {
      const index = matches.length
      matches.push({
        index,
        round: 1,
        slot: i,
        homeTeamId: home,
        awayTeamId: away,
        homeSourceIndex: null,
        awaySourceIndex: null,
      })
      feeders.push({ kind: 'winner', index })
    } else if (home || away) {
      // BYE: el equipo pasa de ronda sin jugar. NO se crea un partido fantasma.
      feeders.push({ kind: 'team', teamId: (home ?? away)! })
    } else {
      feeders.push(null)
    }
  }

  // ── Rondas siguientes ──────────────────────────────────────────
  for (let round = 2; round <= totalRounds; round++) {
    const next: typeof feeders = []
    for (let i = 0; i < feeders.length / 2; i++) {
      const a = feeders[i * 2] ?? null
      const b = feeders[i * 2 + 1] ?? null
      if (!a && !b) {
        next.push(null)
        continue
      }
      if (!a || !b) {
        next.push(a ?? b)
        continue
      }
      const index = matches.length
      matches.push({
        index,
        round,
        slot: i,
        homeTeamId: a.kind === 'team' ? a.teamId : null,
        awayTeamId: b.kind === 'team' ? b.teamId : null,
        homeSourceIndex: a.kind === 'winner' ? a.index : null,
        awaySourceIndex: b.kind === 'winner' ? b.index : null,
      })
      next.push({ kind: 'winner', index })
    }
    feeders = next
  }

  // ── Tercer puesto ──────────────────────────────────────────────
  if (opts.thirdPlace) {
    const semis = matches.filter((m) => m.round === totalRounds - 1)
    if (semis.length === 2) {
      matches.push({
        index: matches.length,
        round: totalRounds,
        slot: 1,
        homeTeamId: null,
        awayTeamId: null,
        // Se alimenta de los PERDEDORES; el service lo resuelve al cargar el
        // resultado de la semi, mirando isThirdPlace.
        homeSourceIndex: semis[0]!.index,
        awaySourceIndex: semis[1]!.index,
        isThirdPlace: true,
      })
    }
  }

  return matches
}

/** Nombre de la ronda en criollo, contando desde la final hacia atrás. */
export function knockoutRoundLabel(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round
  switch (fromFinal) {
    case 0:
      return 'Final'
    case 1:
      return 'Semifinal'
    case 2:
      return 'Cuartos de final'
    case 3:
      return 'Octavos de final'
    case 4:
      return 'Dieciseisavos'
    default:
      return `Ronda ${round}`
  }
}
