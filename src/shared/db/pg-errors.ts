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
const PG_LOCK_NOT_AVAILABLE = '55P03'
const PG_SERIALIZATION_FAILURE = '40001'
const PG_DEADLOCK_DETECTED = '40P01'
const PG_INSUFFICIENT_PRIVILEGE = '42501'

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

/**
 * `55P03 lock_not_available`: la fila estaba tomada por otra transacción y el
 * `lock_timeout` del rol se agotó esperándola.
 *
 * El rol web tiene `lock_timeout = '3s'` (migr. 055) y los `FOR UPDATE` de
 * facturación siguen tomados mientras la operación viaja a MercadoPago
 * (`billing.service.ts:34-41`, hasta 8 s de timeout). Dos pestañas o un doble
 * click sobre "Activar plan" dejan a la segunda esperando una fila que no se
 * libera a tiempo.
 *
 * No es un fallo del sistema: es concurrencia normal y el reintento del usuario
 * funciona. Sin este predicado salía como 500 y encima iba a Sentry.
 */
export function isLockTimeout(err: unknown): boolean {
  return asPgError(err)?.code === PG_LOCK_NOT_AVAILABLE
}

/**
 * `40P01 deadlock_detected` / `40001 serialization_failure`: Postgres abortó ESTA
 * transacción para destrabar un cruce de locks con otra. Es concurrencia normal y
 * el reintento del usuario funciona. No se reintenta adentro: una transacción
 * abortada no se puede reusar, hay que abrir otra desde el caller.
 */
export function isConcurrencyConflict(err: unknown): boolean {
  const code = asPgError(err)?.code
  return code === PG_DEADLOCK_DETECTED || code === PG_SERIALIZATION_FAILURE
}

/**
 * `42501 insufficient_privilege`: la RLS (o un GRANT) rechazó la escritura. Bajo
 * el rol real de la app es lo que ve un jugador que toca algo que no es suyo.
 */
export function isInsufficientPrivilege(err: unknown): boolean {
  return asPgError(err)?.code === PG_INSUFFICIENT_PRIVILEGE
}

const PG_RAISE_EXCEPTION = 'P0001'
const RIVAL_ERROR_CODE_RE = /^rival_[a-z_]+$/

/**
 * Código estable de un `RAISE EXCEPTION 'rival_*'` de los triggers y funciones
 * de RIVAL (migr. 099), o null si el error no es uno de esos.
 *
 * La migración usa el código como MESSAGE (SQLSTATE `P0001`), por ejemplo
 * `rival_full` o `rival_banned`. Camina la cadena de `cause` por el mismo
 * motivo que `asPgError`: Drizzle 0.45 envuelve el error de postgres-js.
 */
export function rivalErrorCode(err: unknown): string | null {
  let current: unknown = err
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (typeof current === 'object') {
      const { code, message } = current as { code?: unknown; message?: unknown }
      if (
        code === PG_RAISE_EXCEPTION &&
        typeof message === 'string' &&
        RIVAL_ERROR_CODE_RE.test(message)
      ) {
        return message
      }
    }
    current = (current as { cause?: unknown }).cause
  }
  return null
}
