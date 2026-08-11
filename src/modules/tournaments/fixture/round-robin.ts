import { FixtureGenerationError } from '../tournament.errors'

/**
 * Todos contra todos por el método del círculo (Berger).
 *
 * Se fija el primer equipo y se rotan los demás: con N equipos (par) salen N-1
 * fechas de N/2 partidos, y cada par se enfrenta exactamente una vez. Con N
 * impar se agrega un BYE — el equipo que le toca queda libre esa fecha.
 *
 * Puro: no sabe de fechas, canchas ni DB. El scheduler se encarga de eso.
 */

/** Sentinela del equipo fantasma que se agrega cuando son impares. */
const BYE = '__bye__'

type Pairing = { homeTeamId: string; awayTeamId: string }
export type FixtureRound = { round: number; pairings: Pairing[] }

export type RoundRobinOptions = {
  /** 1 = solo ida, 2 = ida y vuelta (la vuelta invierte la localía). */
  legs?: 1 | 2
}

/** Máximo defensivo: 64 equipos ya son 2016 partidos de ida. */
const MAX_TEAMS = 64

export function generateRoundRobin(
  teamIds: readonly string[],
  opts: RoundRobinOptions = {},
): FixtureRound[] {
  const legs = opts.legs ?? 1

  if (teamIds.length < 2) {
    throw new FixtureGenerationError('Hacen falta al menos 2 equipos para armar el fixture.')
  }
  if (teamIds.length > MAX_TEAMS) {
    throw new FixtureGenerationError(`No se puede armar un fixture de más de ${MAX_TEAMS} equipos.`)
  }
  if (new Set(teamIds).size !== teamIds.length) {
    throw new FixtureGenerationError('Hay equipos repetidos en la lista.')
  }

  // Con impares entra el BYE: así el algoritmo siempre trabaja con par.
  const roster = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, BYE]
  const n = roster.length
  const roundsPerLeg = n - 1
  const half = n / 2

  const firstLeg: FixtureRound[] = []

  for (let r = 0; r < roundsPerLeg; r++) {
    const pairings: Pairing[] = []
    for (let i = 0; i < half; i++) {
      const a = roster[i]!
      const b = roster[n - 1 - i]!
      if (a === BYE || b === BYE) continue // ese equipo queda libre esta fecha

      // Alternar la localía por fecha: sin esto el equipo fijo (índice 0)
      // jugaría siempre de local y el reparto quedaría torcido.
      const swap = r % 2 === 1 && i === 0
      pairings.push(swap ? { homeTeamId: b, awayTeamId: a } : { homeTeamId: a, awayTeamId: b })
    }
    firstLeg.push({ round: r + 1, pairings })

    // Rotación: el primero queda fijo, el resto gira una posición.
    const fixed = roster[0]!
    const rest = roster.slice(1)
    rest.unshift(rest.pop()!)
    roster.splice(0, roster.length, fixed, ...rest)
  }

  if (legs === 1) return firstLeg

  // Vuelta: mismas cruces con la localía invertida, numeradas a continuación.
  const secondLeg: FixtureRound[] = firstLeg.map((r) => ({
    round: r.round + roundsPerLeg,
    pairings: r.pairings.map((p) => ({
      homeTeamId: p.awayTeamId,
      awayTeamId: p.homeTeamId,
    })),
  }))

  return [...firstLeg, ...secondLeg]
}

/** Cuántos partidos tiene un todos-contra-todos. Útil para avisar antes de generar. */
export function roundRobinMatchCount(teamCount: number, legs: 1 | 2 = 1): number {
  return ((teamCount * (teamCount - 1)) / 2) * legs
}
