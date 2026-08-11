import { describe, expect, it } from 'vitest'
import {
  generateKnockout,
  knockoutRoundLabel,
  type BracketMatch,
} from '@/modules/tournaments/fixture/knockout'
import { distributeIntoGroups, groupLabel } from '@/modules/tournaments/fixture/groups'
import { FixtureGenerationError } from '@/modules/tournaments/tournament.errors'

const teams = (n: number): string[] => Array.from({ length: n }, (_, i) => `t${i + 1}`)

/** Equipos que entran al cuadro: los de ronda 1 más los que pasaron con BYE. */
function teamsInBracket(matches: BracketMatch[]): Set<string> {
  const out = new Set<string>()
  for (const m of matches) {
    if (m.homeTeamId) out.add(m.homeTeamId)
    if (m.awayTeamId) out.add(m.awayTeamId)
  }
  return out
}

describe('generateKnockout — cuadro potencia de 2', () => {
  it('con 8 equipos salen 7 partidos en 3 rondas', () => {
    const m = generateKnockout(teams(8))
    expect(m).toHaveLength(7) // n-1: es lo que hace falta para tener campeón
    expect(m.filter((x) => x.round === 1)).toHaveLength(4)
    expect(m.filter((x) => x.round === 2)).toHaveLength(2)
    expect(m.filter((x) => x.round === 3)).toHaveLength(1)
  })

  it('todos los equipos entran en la primera ronda', () => {
    const m = generateKnockout(teams(8))
    const r1 = m.filter((x) => x.round === 1)
    const seen = r1.flatMap((x) => [x.homeTeamId, x.awayTeamId])
    expect(new Set(seen).size).toBe(8)
    expect(seen.every((t) => t !== null)).toBe(true)
  })

  it('la siembra cruza al 1 con el último', () => {
    const m = generateKnockout(teams(8))
    const first = m.find((x) => x.round === 1 && x.slot === 0)!
    expect([first.homeTeamId, first.awayTeamId].sort()).toEqual(['t1', 't8'])
  })

  it('las rondas siguientes se alimentan de ganadores, no de equipos', () => {
    const m = generateKnockout(teams(8))
    for (const match of m.filter((x) => x.round > 1)) {
      expect(match.homeTeamId).toBeNull()
      expect(match.awayTeamId).toBeNull()
      expect(match.homeSourceIndex).not.toBeNull()
      expect(match.awaySourceIndex).not.toBeNull()
    }
  })

  it('ningún partido se alimenta de sí mismo ni de uno posterior', () => {
    const m = generateKnockout(teams(16))
    for (const match of m) {
      for (const src of [match.homeSourceIndex, match.awaySourceIndex]) {
        if (src === null) continue
        expect(src).toBeLessThan(match.index)
        expect(m[src]!.round).toBeLessThan(match.round)
      }
    }
  })

  it('con 2 equipos es un solo partido', () => {
    const m = generateKnockout(teams(2))
    expect(m).toHaveLength(1)
    expect(m[0]!.round).toBe(1)
  })
})

describe('generateKnockout — cantidad que no es potencia de 2 (BYE)', () => {
  it('con 5 equipos salen 4 partidos y nadie queda afuera', () => {
    const m = generateKnockout(teams(5))
    expect(m).toHaveLength(4) // n-1
    expect(teamsInBracket(m).size).toBe(5)
  })

  it('no crea partidos fantasma con un solo equipo', () => {
    for (const n of [3, 5, 6, 7, 9, 11]) {
      const m = generateKnockout(teams(n))
      expect(m).toHaveLength(n - 1)
      for (const match of m) {
        const known = (match.homeTeamId !== null ? 1 : 0) + (match.homeSourceIndex !== null ? 1 : 0)
        const knownAway =
          (match.awayTeamId !== null ? 1 : 0) + (match.awaySourceIndex !== null ? 1 : 0)
        // Cada lado tiene exactamente un origen: equipo directo o ganador.
        expect(known).toBe(1)
        expect(knownAway).toBe(1)
      }
    }
  })

  it('el equipo con BYE aparece directo en la segunda ronda', () => {
    const m = generateKnockout(teams(5))
    // t1 es el mejor sembrado: le toca el hueco, así que pasa sin jugar.
    const r1Teams = m.filter((x) => x.round === 1).flatMap((x) => [x.homeTeamId, x.awayTeamId])
    expect(r1Teams).not.toContain('t1')
    const r2 = m.filter((x) => x.round === 2)
    expect(r2.some((x) => x.homeTeamId === 't1' || x.awayTeamId === 't1')).toBe(true)
  })
})

describe('generateKnockout — tercer puesto', () => {
  it('agrega un partido que se alimenta de las dos semis', () => {
    const m = generateKnockout(teams(8), { thirdPlace: true })
    expect(m).toHaveLength(8) // 7 + el del tercer puesto
    const third = m.find((x) => x.isThirdPlace)!
    expect(third).toBeDefined()
    expect(third.round).toBe(3)
    const semis = m.filter((x) => x.round === 2).map((x) => x.index)
    expect(semis).toContain(third.homeSourceIndex)
    expect(semis).toContain(third.awaySourceIndex)
  })

  it('no lo agrega si no hay semifinales', () => {
    const m = generateKnockout(teams(2), { thirdPlace: true })
    expect(m.some((x) => x.isThirdPlace)).toBe(false)
  })
})

describe('generateKnockout — entradas inválidas', () => {
  it('rechaza menos de 2 equipos y repetidos', () => {
    expect(() => generateKnockout(['solo'])).toThrow(FixtureGenerationError)
    expect(() => generateKnockout(['a', 'a'])).toThrow(FixtureGenerationError)
  })
})

describe('knockoutRoundLabel', () => {
  it('nombra las rondas contando desde la final', () => {
    expect(knockoutRoundLabel(3, 3)).toBe('Final')
    expect(knockoutRoundLabel(2, 3)).toBe('Semifinal')
    expect(knockoutRoundLabel(1, 3)).toBe('Cuartos de final')
    expect(knockoutRoundLabel(1, 4)).toBe('Octavos de final')
  })
})

describe('distributeIntoGroups', () => {
  it('reparte parejo y sin perder ni duplicar equipos', () => {
    const groups = distributeIntoGroups(teams(12), 4)
    expect(groups).toHaveLength(4)
    for (const g of groups) expect(g.teamIds).toHaveLength(3)
    const all = groups.flatMap((g) => g.teamIds)
    expect(new Set(all).size).toBe(12)
  })

  it('usa serpentina: los dos mejores no caen en la misma zona', () => {
    const groups = distributeIntoGroups(teams(8), 2)
    const zoneOf = (t: string) => groups.findIndex((g) => g.teamIds.includes(t))
    expect(zoneOf('t1')).not.toBe(zoneOf('t2'))
    // La serpentina devuelve: el 4to sembrado vuelve a la zona del 1ro.
    expect(zoneOf('t1')).toBe(zoneOf('t4'))
  })

  it('con cantidad no divisible, reparte lo más parejo posible', () => {
    const groups = distributeIntoGroups(teams(7), 3)
    const sizes = groups.map((g) => g.teamIds.length).sort()
    expect(sizes).toEqual([2, 2, 3])
  })

  it('etiqueta las zonas A, B, C…', () => {
    expect(distributeIntoGroups(teams(6), 3).map((g) => g.label)).toEqual(['A', 'B', 'C'])
    expect(groupLabel(0)).toBe('A')
    expect(groupLabel(25)).toBe('Z')
    expect(groupLabel(26)).toBe('AA')
  })

  it('rechaza zonas que quedarían con menos de 2 equipos', () => {
    expect(() => distributeIntoGroups(teams(3), 2)).toThrow(FixtureGenerationError)
  })
})
