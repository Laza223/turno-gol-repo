import { describe, expect, it } from 'vitest'
import { generateRoundRobin, roundRobinMatchCount } from '@/modules/tournaments/fixture/round-robin'
import { FixtureGenerationError } from '@/modules/tournaments/tournament.errors'

const teams = (n: number): string[] => Array.from({ length: n }, (_, i) => `t${i + 1}`)

/** Clave sin orden: el enfrentamiento A-B es el mismo que B-A. */
const pairKey = (a: string, b: string) => [a, b].sort().join('|')

function allPairs(rounds: ReturnType<typeof generateRoundRobin>): string[] {
  return rounds.flatMap((r) => r.pairings.map((p) => pairKey(p.homeTeamId, p.awayTeamId)))
}

describe('generateRoundRobin — cantidad par de equipos', () => {
  it('cada par se enfrenta exactamente una vez', () => {
    for (const n of [2, 4, 6, 8, 10]) {
      const pairs = allPairs(generateRoundRobin(teams(n)))
      expect(pairs).toHaveLength(roundRobinMatchCount(n))
      expect(new Set(pairs).size).toBe(pairs.length)
    }
  })

  it('salen N-1 fechas de N/2 partidos', () => {
    const rounds = generateRoundRobin(teams(8))
    expect(rounds).toHaveLength(7)
    for (const r of rounds) expect(r.pairings).toHaveLength(4)
  })

  it('ningún equipo juega dos veces en la misma fecha', () => {
    for (const r of generateRoundRobin(teams(10))) {
      const seen = r.pairings.flatMap((p) => [p.homeTeamId, p.awayTeamId])
      expect(new Set(seen).size).toBe(seen.length)
    }
  })

  it('las fechas se numeran desde 1 y sin huecos', () => {
    const rounds = generateRoundRobin(teams(6))
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5])
  })

  it('reparte la localía: nadie juega todas de local', () => {
    // Sin alternar, el equipo fijo del método del círculo sería local siempre.
    const rounds = generateRoundRobin(teams(8))
    const homeCount = new Map<string, number>()
    for (const r of rounds) {
      for (const p of r.pairings) {
        homeCount.set(p.homeTeamId, (homeCount.get(p.homeTeamId) ?? 0) + 1)
      }
    }
    for (const n of homeCount.values()) {
      expect(n).toBeGreaterThan(0)
      expect(n).toBeLessThan(7)
    }
  })
})

describe('generateRoundRobin — cantidad impar (BYE)', () => {
  it('cada par se enfrenta exactamente una vez', () => {
    for (const n of [3, 5, 7, 9]) {
      const pairs = allPairs(generateRoundRobin(teams(n)))
      expect(pairs).toHaveLength(roundRobinMatchCount(n))
      expect(new Set(pairs).size).toBe(pairs.length)
    }
  })

  it('salen N fechas y en cada una queda un equipo libre', () => {
    const n = 7
    const rounds = generateRoundRobin(teams(n))
    expect(rounds).toHaveLength(n) // N impar → N fechas
    for (const r of rounds) expect(r.pairings).toHaveLength((n - 1) / 2)
  })

  it('cada equipo queda libre exactamente una vez', () => {
    const n = 5
    const rounds = generateRoundRobin(teams(n))
    const freeCount = new Map<string, number>(teams(n).map((t) => [t, 0]))
    for (const r of rounds) {
      const playing = new Set(r.pairings.flatMap((p) => [p.homeTeamId, p.awayTeamId]))
      for (const t of teams(n)) {
        if (!playing.has(t)) freeCount.set(t, freeCount.get(t)! + 1)
      }
    }
    for (const c of freeCount.values()) expect(c).toBe(1)
  })

  it('el BYE nunca aparece como equipo', () => {
    for (const r of generateRoundRobin(teams(5))) {
      for (const p of r.pairings) {
        expect(p.homeTeamId).not.toContain('bye')
        expect(p.awayTeamId).not.toContain('bye')
      }
    }
  })
})

describe('generateRoundRobin — ida y vuelta', () => {
  it('duplica los partidos y numera las fechas a continuación', () => {
    const rounds = generateRoundRobin(teams(6), { legs: 2 })
    expect(rounds).toHaveLength(10)
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(allPairs(rounds)).toHaveLength(roundRobinMatchCount(6, 2))
  })

  it('cada par se enfrenta dos veces, una de local cada uno', () => {
    const rounds = generateRoundRobin(teams(4), { legs: 2 })
    const asHome = new Map<string, Set<string>>()
    for (const r of rounds) {
      for (const p of r.pairings) {
        const set = asHome.get(p.homeTeamId) ?? new Set<string>()
        set.add(p.awayTeamId)
        asHome.set(p.homeTeamId, set)
      }
    }
    // Si A fue local contra B, B tuvo que ser local contra A en la vuelta.
    for (const [home, aways] of asHome) {
      for (const away of aways) {
        expect(asHome.get(away)?.has(home)).toBe(true)
      }
    }
  })

  it('con impares también funciona', () => {
    const pairs = allPairs(generateRoundRobin(teams(5), { legs: 2 }))
    expect(pairs).toHaveLength(roundRobinMatchCount(5, 2))
  })
})

describe('generateRoundRobin — entradas inválidas', () => {
  it('rechaza menos de 2 equipos', () => {
    expect(() => generateRoundRobin([])).toThrow(FixtureGenerationError)
    expect(() => generateRoundRobin(['solo'])).toThrow(FixtureGenerationError)
  })

  it('rechaza equipos repetidos', () => {
    expect(() => generateRoundRobin(['a', 'b', 'a'])).toThrow(FixtureGenerationError)
  })

  it('rechaza un torneo absurdamente grande', () => {
    expect(() => generateRoundRobin(teams(65))).toThrow(FixtureGenerationError)
  })
})
