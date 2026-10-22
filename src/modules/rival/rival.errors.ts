// Errores de dominio de RIVAL. Mensajes en inglés: la traducción a es-AR vive en
// la Server Action (patrón tournament.errors.ts). Ningún error de la base llega
// crudo a quien llama: `mapRivalDbError` los convierte acá.
import {
  isConcurrencyConflict,
  isInsufficientPrivilege,
  isLockTimeout,
  isUniqueViolation,
  rivalErrorCode,
} from '@/shared/db/pg-errors'

/** Los `RAISE EXCEPTION` de la migración 099 (el código es el MESSAGE, SQLSTATE P0001). */
const DB_ERROR_CODES = [
  'rival_not_found',
  'rival_no_session',
  'rival_expired',
  'rival_canceled',
  'rival_full',
  'rival_banned',
  'rival_limit_active',
  'rival_limit_requests',
  'rival_forbidden_transition',
  'rival_immutable',
  'rival_not_on_board',
  'rival_hidden',
  'rival_booking_mismatch',
  'rival_court_required',
  'rival_contact_required',
  'rival_invalid_report',
  'rival_captain_taken',
] as const

/** Códigos que NO salen de un `RAISE` de la base: infraestructura, índices únicos y chequeos del service. */
const SERVICE_ERROR_CODES = [
  // La RLS rechazó la escritura (42501): el jugador tocó algo que no es suyo.
  'rival_forbidden',
  // Deadlock (40P01), fallo de serialización (40001) o lock_timeout (55P03): la
  // UI dice "probá de nuevo". Sin reintento acá: la transacción ya está abortada.
  'rival_try_again',
  // Índices únicos de la 099 (23505).
  'rival_already_participant',
  'rival_already_reported',
  // Chequeos del service (no salen de la base).
  'rival_tenant_unavailable',
  'rival_welcome_required',
] as const

/** Todos los códigos que puede llevar un `RivalError` (la UI tiene que tener copy para cada uno). */
export const RIVAL_ERROR_CODES = [...DB_ERROR_CODES, ...SERVICE_ERROR_CODES] as const

export type RivalErrorCode = (typeof RIVAL_ERROR_CODES)[number]

export class RivalError extends Error {
  constructor(public readonly code: RivalErrorCode) {
    super(code)
    this.name = 'RivalError'
  }
}

function isDbErrorCode(code: string): code is (typeof DB_ERROR_CODES)[number] {
  return (DB_ERROR_CODES as readonly string[]).includes(code)
}

/**
 * Error de la base → error de dominio, o `null` si no es uno de RIVAL (una caída
 * de conexión, por ejemplo: eso es un fallo de infraestructura y el caller lo
 * deja subir tal cual para que llegue a Sentry).
 *
 * Cubre los `rival_*` de los triggers/funciones, el índice único del capitán
 * rival (la carrera de dos "aceptar" simultáneos: gana uno y el otro choca
 * con el índice antes que con el chequeo del trigger), el UNIQUE del plantel
 * y de las denuncias, y el 42501 de la RLS.
 */
export function mapRivalDbError(err: unknown): RivalError | null {
  const code = rivalErrorCode(err)
  if (code !== null) return isDbErrorCode(code) ? new RivalError(code) : null
  if (isUniqueViolation(err, 'uq_rival_participants_captain')) {
    return new RivalError('rival_captain_taken')
  }
  if (isUniqueViolation(err, 'uq_rival_participants_match_player')) {
    return new RivalError('rival_already_participant')
  }
  if (isUniqueViolation(err, 'uq_rival_reports_match_reporter_reported')) {
    return new RivalError('rival_already_reported')
  }
  if (isInsufficientPrivilege(err)) return new RivalError('rival_forbidden')
  if (isConcurrencyConflict(err) || isLockTimeout(err)) return new RivalError('rival_try_again')
  return null
}
