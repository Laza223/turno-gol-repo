import { FixtureGenerationError } from '../tournament.errors'

/**
 * Reparto de equipos en zonas.
 *
 * Serpentina (1-2-3-3-2-1): con los equipos ordenados por siembra, reparte de
 * ida y de vuelta para que ninguna zona junte a todos los mejores. Sin siembra
 * el orden que entra es el que manda, así que da lo mismo — pero el reparto
 * sigue quedando parejo en cantidad.
 *
 * Puro: sin DB.
 */

export type TeamGroup = {
  /** 'A', 'B', 'C'… Es lo que va a `tournament_teams.group_label`. */
  label: string
  teamIds: string[]
}

const MAX_GROUPS = 16

/** 'A'..'Z', después 'AA', 'AB'… (no debería llegar nunca, pero no rompe). */
export function groupLabel(index: number): string {
  let label = ''
  let n = index
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

export function distributeIntoGroups(teamIds: readonly string[], groupCount: number): TeamGroup[] {
  if (groupCount < 1) {
    throw new FixtureGenerationError('Hace falta al menos una zona.')
  }
  if (groupCount > MAX_GROUPS) {
    throw new FixtureGenerationError(`No se pueden armar más de ${MAX_GROUPS} zonas.`)
  }
  if (teamIds.length < groupCount * 2) {
    throw new FixtureGenerationError(
      `Con ${teamIds.length} equipos no alcanza para ${groupCount} zonas: cada zona necesita al menos 2.`,
    )
  }
  if (new Set(teamIds).size !== teamIds.length) {
    throw new FixtureGenerationError('Hay equipos repetidos en la lista.')
  }

  const groups: TeamGroup[] = Array.from({ length: groupCount }, (_, i) => ({
    label: groupLabel(i),
    teamIds: [],
  }))

  teamIds.forEach((teamId, i) => {
    const row = Math.floor(i / groupCount)
    const col = i % groupCount
    // Filas impares al revés: eso es la serpentina.
    const target = row % 2 === 0 ? col : groupCount - 1 - col
    groups[target]!.teamIds.push(teamId)
  })

  return groups
}
