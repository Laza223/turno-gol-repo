/**
 * Traducción de errores de Postgres a errores de dominio.
 *
 * Drizzle 0.45 envuelve lo que tira postgres-js en un `DrizzleQueryError`: el
 * `code` y el `constraint_name` viajan en `cause`, NO en el error de arriba.
 * Mirar solo el nivel superior hace que un 23505 se escape crudo hacia la UI en
 * vez de convertirse en un error con mensaje útil — pasó en la fase 1 y lo cazó
 * un test de integración, no el typecheck.
 */

const PG_UNIQUE_VIOLATION = '23505'
const PG_FOREIGN_KEY_VIOLATION = '23503'

type PgErrorLike = { code?: string; constraint_name?: string; constraint?: string }

function asPgError(err: unknown): PgErrorLike | null {
  let current: unknown = err
  // Tope de saltos: la cadena de `cause` es corta y no queremos un ciclo.
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (typeof current === 'object' && 'code' in current) {
      const code = (current as { code?: unknown }).code
      if (typeof code === 'string') return current as PgErrorLike
    }
    current = (current as { cause?: unknown }).cause
  }
  return null
}

function constraintOf(pg: PgErrorLike): string {
  return String(pg.constraint_name ?? pg.constraint ?? '')
}

export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const pg = asPgError(err)
  if (!pg || pg.code !== PG_UNIQUE_VIOLATION) return false
  return constraintOf(pg).includes(constraint)
}

export function isForeignKeyViolation(err: unknown, constraint: string): boolean {
  const pg = asPgError(err)
  if (!pg || pg.code !== PG_FOREIGN_KEY_VIOLATION) return false
  return constraintOf(pg).includes(constraint)
}
