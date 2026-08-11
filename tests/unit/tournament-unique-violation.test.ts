import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from '@/modules/tournaments/tournament-team.service'

/**
 * Regresión: Drizzle 0.45 envuelve lo que tira postgres-js en un
 * DrizzleQueryError, así que `code` y `constraint_name` quedan en `cause`.
 * La versión que solo miraba el nivel de arriba dejaba escapar el 23505 crudo
 * hacia la UI en vez de convertirlo en DuplicateTeamNameError — lo cazó el test
 * de integración contra Postgres real, y esto lo fija sin necesitar DB.
 */

/** Forma real del error, tal como lo reportó CI. */
function drizzleWrapped(constraintName: string) {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint'), {
    name: 'PostgresError',
    code: '23505',
    constraint_name: constraintName,
    table_name: 'tournament_teams',
  })
  return Object.assign(new Error('Failed query: insert into "tournament_teams" …'), {
    name: 'DrizzleQueryError',
    cause,
  })
}

/** postgres-js sin envolver (lo que se ve al usar sql`` crudo). */
function bare(constraintName: string) {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    name: 'PostgresError',
    code: '23505',
    constraint_name: constraintName,
  })
}

describe('isUniqueViolation', () => {
  it('reconoce el 23505 envuelto por Drizzle', () => {
    expect(
      isUniqueViolation(drizzleWrapped('uq_tournament_teams_name'), 'uq_tournament_teams_name'),
    ).toBe(true)
  })

  it('reconoce el 23505 sin envolver', () => {
    expect(isUniqueViolation(bare('uq_tournament_teams_name'), 'uq_tournament_teams_name')).toBe(
      true,
    )
  })

  it('distingue el constraint: no confunde dos únicos de la misma tabla', () => {
    const shirt = drizzleWrapped('uq_tournament_team_players_shirt')
    expect(isUniqueViolation(shirt, 'uq_tournament_team_players_shirt')).toBe(true)
    expect(isUniqueViolation(shirt, 'uq_tournament_teams_name')).toBe(false)
  })

  it('ignora otros códigos de error de Postgres', () => {
    const fk = Object.assign(new Error('wrapped'), {
      cause: Object.assign(new Error('fk'), {
        code: '23503',
        constraint_name: 'uq_tournament_teams_name',
      }),
    })
    expect(isUniqueViolation(fk, 'uq_tournament_teams_name')).toBe(false)
  })

  it('no explota con basura', () => {
    expect(isUniqueViolation(null, 'x')).toBe(false)
    expect(isUniqueViolation(undefined, 'x')).toBe(false)
    expect(isUniqueViolation('boom', 'x')).toBe(false)
    expect(isUniqueViolation(new Error('sin code'), 'x')).toBe(false)
  })

  it('no se cuelga con una cadena de cause circular', () => {
    const a: { cause?: unknown } = {}
    const b: { cause?: unknown } = { cause: a }
    a.cause = b
    expect(isUniqueViolation(a, 'x')).toBe(false)
  })
})
