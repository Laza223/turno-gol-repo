import { NextResponse } from 'next/server'
import type { ZodError } from 'zod'
import { getRequestContext } from '@/shared/lib/request-context'

/**
 * Standard error envelope for Route Handlers (doc15 §2.3 / §2.4).
 *
 *   {
 *     "error": { "code": "...", "message": "...", "details"?: ... },
 *     "meta":  { "request_id": "..." | null }
 *   }
 *
 * Server Actions keep their idiomatic `{ success, error }` result shape — this
 * helper is for HTTP responses only. `details` is omitted from the body when
 * not provided. `meta.request_id` is taken from the active request context
 * (set by the observability middleware); it is `null` outside a request scope.
 */
export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown }
  meta: { request_id: string | null }
}

function buildMeta(): ApiErrorBody['meta'] {
  return { request_id: getRequestContext()?.requestId ?? null }
}

/** Low-level builder. Prefer the named factories below for the common cases. */
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  const error: ApiErrorBody['error'] = { code, message }
  if (details !== undefined) error.details = details
  const body: ApiErrorBody = { error, meta: buildMeta() }
  return NextResponse.json(body, { status })
}

/** Options accepted by every factory: override the default code or attach details. */
export type ApiErrorOpts = { code?: string; details?: unknown }

export function badRequest(message = 'Solicitud inválida.', opts: ApiErrorOpts = {}): NextResponse {
  return apiError(400, opts.code ?? 'VALIDATION_ERROR', message, opts.details)
}

export function unauthorized(
  message = 'Autenticación requerida.',
  opts: ApiErrorOpts = {},
): NextResponse {
  return apiError(401, opts.code ?? 'UNAUTHORIZED', message, opts.details)
}

export function forbidden(
  message = 'No tenés permiso para realizar esta acción.',
  opts: ApiErrorOpts = {},
): NextResponse {
  return apiError(403, opts.code ?? 'FORBIDDEN', message, opts.details)
}

export function notFound(message = 'El recurso no existe.', opts: ApiErrorOpts = {}): NextResponse {
  return apiError(404, opts.code ?? 'NOT_FOUND', message, opts.details)
}

export function conflict(message = 'Conflicto de estado.', opts: ApiErrorOpts = {}): NextResponse {
  return apiError(409, opts.code ?? 'CONFLICT', message, opts.details)
}

/** 422 — Business-rule violation (doc15 §2.5). */
export function businessRule(
  message = 'No se puede completar la operación por una regla de negocio.',
  opts: ApiErrorOpts = {},
): NextResponse {
  return apiError(422, opts.code ?? 'BUSINESS_RULE_VIOLATION', message, opts.details)
}

/** 503 — Graceful degradation (MP down, etc.). */
export function serviceUnavailable(
  message = 'El servicio no está disponible temporalmente.',
  opts: ApiErrorOpts = {},
): NextResponse {
  return apiError(503, opts.code ?? 'SERVICE_UNAVAILABLE', message, opts.details)
}

export function internal(
  message = 'Ocurrió un error interno.',
  opts: ApiErrorOpts = {},
): NextResponse {
  return apiError(500, opts.code ?? 'INTERNAL_ERROR', message, opts.details)
}

/**
 * Flatten a ZodError into `{ fieldPath: firstMessage }` (doc15 §2.4). The first
 * issue per path wins; the empty path (root) maps to `_`.
 */
export function zodFieldErrors(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of err.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_'
    if (!(key in fields)) fields[key] = issue.message
  }
  return fields
}

/**
 * VALIDATION_ERROR response (doc15 §2.4). Accepts a ZodError (emits
 * `details.fields`) or a plain message. Defaults to HTTP 400; pass
 * `{ status: 422 }` for routes that historically returned 422 on body
 * validation (e.g. admin booking mutations).
 */
export function validationError(
  err: ZodError | string,
  opts: { status?: number; message?: string } = {},
): NextResponse {
  const status = opts.status ?? 400
  if (typeof err === 'string') {
    return apiError(status, 'VALIDATION_ERROR', opts.message ?? err)
  }
  const message = opts.message ?? err.issues[0]?.message ?? 'Los datos enviados no son válidos.'
  return apiError(status, 'VALIDATION_ERROR', message, { fields: zodFieldErrors(err) })
}
