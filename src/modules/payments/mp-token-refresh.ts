/**
 * Pure MP-error-shape-detection helpers (401 unauthorized — Hallazgo 4 — and
 * ENS-23's invalid-payer preapproval rejection). No DB/SDK deps so callers
 * (the gateway implementation, the OAuth service, billing.service.ts) can
 * import them without a cycle, and so the detection is directly unit-testable.
 */

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/**
 * Rechazo del PolicyAgent de MercadoPago: la aplicación no tiene permiso para
 * esa operación. Trae la palabra "UNAUTHORIZED" en el texto, y por eso hay que
 * distinguirlo a mano de un token vencido.
 */
const POLICY_RECHAZO_RE = /policy returned unauthorized|PA_UNAUTHORIZED_RESULT_FROM_POLICIES/i

/**
 * True when a MercadoPago error represents an expired/invalid access token
 * (HTTP 401). Handles the raw SDK error shape (`status`/`statusCode`), a nested
 * `cause`, and a 401/"unauthorized" message fallback.
 *
 * 🔴 Ese fallback por texto se comía el 403 de permisos y tapaba el
 * diagnóstico. MercadoPago rechaza un reembolso sin permiso con
 * `403 { code: 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES', message: 'At least one
 * policy returned UNAUTHORIZED.' }`, y ese texto matcheaba /unauthorized/i:
 * `withTokenRefresh` lo tomaba por token vencido, salía a renovar, la
 * renovación fallaba, y lo que llegaba al log era
 * `MP token refresh failed (HTTP 400)`. O sea que el motivo REAL de que no se
 * pudiera devolver una seña estuvo enmascarado todo el tiempo, en los dos
 * complejos de producción (medido el 2026-08-23: Elite y titi, mismo síntoma
 * con aplicaciones de MercadoPago distintas).
 *
 * Renovar el token ante un 403 de permisos nunca sirvió de nada: los permisos
 * los deriva MercadoPago del producto de la aplicación, así que el token nuevo
 * sale con exactamente los mismos.
 */
export function isMpUnauthorized(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { status?: unknown; statusCode?: unknown; cause?: unknown; message?: unknown }
  const cause =
    typeof e.cause === 'object' && e.cause !== null
      ? (e.cause as { status?: unknown; statusCode?: unknown })
      : undefined

  const codes = [
    readNumber(e.status),
    readNumber(e.statusCode),
    readNumber(cause?.status),
    readNumber(cause?.statusCode),
  ]
  if (codes.some((c) => c === 401)) return true
  // MercadoPago dijo qué pasó y no fue un 401: creerle. El texto es peor
  // evidencia que el status, y confundirlos manda a renovar un token sano.
  if (codes.some((c) => c !== undefined)) return false

  const msg = typeof e.message === 'string' ? e.message : ''
  // El rechazo del PolicyAgent trae la palabra "UNAUTHORIZED" y NO es un token
  // vencido: renovarlo no cambia nada, porque los permisos los deriva MP del
  // PRODUCTO de la aplicación y viajan iguales en el token nuevo.
  if (POLICY_RECHAZO_RE.test(msg)) return false
  return /\b401\b|unauthorized/i.test(msg)
}

const INVALID_PAYER_RE = /payer and collector must be real or test users/i

/**
 * True when a MercadoPago error is the specific rejection MP returns when
 * `payer_email` (the tenant owner's email) has no MP account: "Both payer
 * and collector must be real or test users" (ENS-23 — first real subscribe
 * hit this in prod). `MercadoPagoGateway.createPreapproval` wraps the raw SDK
 * error (a plain thrown JSON body, see RestClient.fetch) into
 * `MpGatewayError(msg, cause=rawErr)`, so the message can live either at the
 * top level or nested in `.cause.message` — checks both.
 */
export function isMpInvalidPayerError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { message?: unknown; cause?: unknown }
  if (typeof e.message === 'string' && INVALID_PAYER_RE.test(e.message)) return true

  const cause =
    typeof e.cause === 'object' && e.cause !== null ? (e.cause as { message?: unknown }) : undefined
  return typeof cause?.message === 'string' && INVALID_PAYER_RE.test(cause.message)
}

const ALREADY_CANCELLED_PREAPPROVAL_RE = /can not modify a cancelled preapproval/i

/**
 * True when a MercadoPago error is the specific rejection MP returns when
 * cancelling a preapproval that's ALREADY `cancelled` on their side: "You can
 * not modify a cancelled preapproval." (R2-2 residual — `billing.service.ts
 * reactivate()` cancels the OLD preapproval before creating a new one; if
 * that cancel succeeds on MP but `createPreapprovalOrThrowFriendly` fails
 * right after, the local rollback leaves `mp_subscription_id` still pointing
 * at a preapproval that's already dead in MP — the owner's retry then tries
 * to cancel an already-cancelled one and gets stuck forever). Verified
 * against a REAL MP preapproval by the ensayo orchestrator 2026-07-14:
 * `PUT /preapproval/{id}` with `{status:'cancelled'}` on
 * `e00ea2c8841d443c93d379479e647c19` (already cancelled by K5) returned
 * HTTP 400 with exactly this message (see ENSAYO_GENERAL.md ledger). Same
 * wrapping as `isMpInvalidPayerError`: `MercadoPagoGateway.cancelPreapproval`
 * wraps the raw SDK error (a plain thrown JSON body, see RestClient.fetch)
 * into `MpGatewayError(msg, cause=rawErr)`, so the message can live either at
 * the top level or nested in `.cause.message` — checks both.
 */
export function isMpAlreadyCancelledPreapprovalError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { message?: unknown; cause?: unknown }
  if (typeof e.message === 'string' && ALREADY_CANCELLED_PREAPPROVAL_RE.test(e.message)) return true

  const cause =
    typeof e.cause === 'object' && e.cause !== null ? (e.cause as { message?: unknown }) : undefined
  return typeof cause?.message === 'string' && ALREADY_CANCELLED_PREAPPROVAL_RE.test(cause.message)
}

/**
 * Run `op`; if it fails with a 401, run `refresh` and retry **once**. Any other
 * error — or a second 401 — propagates. Fail-safe for a token that expired
 * between the 4h refresh cron ticks.
 */
export async function withTokenRefresh<T>(
  op: () => Promise<T>,
  refresh: () => Promise<void>,
): Promise<T> {
  try {
    return await op()
  } catch (err) {
    if (!isMpUnauthorized(err)) throw err
    await refresh()
    return op()
  }
}

/** Tope de caracteres del resumen: un log no es lugar para volcar un body entero. */
const MP_ERROR_SUMMARY_MAX = 400

function pushIfString(parts: string[], label: string, value: unknown): void {
  if (typeof value === 'string' && value.trim() !== '') parts.push(`${label}=${value.trim()}`)
  else if (typeof value === 'number') parts.push(`${label}=${value}`)
}

/**
 * Resumen legible de POR QUÉ MercadoPago rechazó algo, para logs.
 *
 * El gateway envuelve todo error del SDK en `MpGatewayError('Failed to ... <id>',
 * cause=rawErr)`, y los tres catches del camino de reembolso loguean sólo
 * `err.message` — o sea, la frase que escribimos nosotros. El motivo real
 * (`status` + el array `cause: [{ code, description }]` que devuelve MP) se
 * descartaba entero. Un reembolso que no llega quedaba como "Failed to refund
 * MP payment 1750…", que no distingue una cuenta sin saldo de un token vencido
 * de un pago no reembolsable. Pasó en producción el 2026-08-21.
 *
 * Devuelve sólo status, códigos y descripciones de MP: son mensajes de la API,
 * sin datos de personas. Nunca el body completo ni el token.
 */
export function describeMpError(err: unknown): string {
  if (typeof err !== 'object' || err === null) return String(err)
  const e = err as { message?: unknown; status?: unknown; statusCode?: unknown; cause?: unknown }
  const parts: string[] = []

  pushIfString(parts, 'msg', e.message)
  pushIfString(parts, 'status', e.status ?? e.statusCode)

  // El SDK anida el error crudo un nivel abajo (MpGatewayError.cause).
  const raw =
    typeof e.cause === 'object' && e.cause !== null
      ? (e.cause as { message?: unknown; status?: unknown; statusCode?: unknown; cause?: unknown })
      : undefined
  if (raw) {
    pushIfString(parts, 'mp_msg', raw.message)
    pushIfString(parts, 'mp_status', raw.status ?? raw.statusCode)

    // `cause` de MP es un array de { code, description } con el motivo real.
    const detail = Array.isArray(raw.cause) ? raw.cause : []
    for (const item of detail.slice(0, 3)) {
      if (typeof item !== 'object' || item === null) continue
      const d = item as { code?: unknown; description?: unknown }
      pushIfString(parts, 'mp_code', d.code)
      pushIfString(parts, 'mp_desc', d.description)
    }
  }

  const summary = parts.join(' ')
  return summary.length > MP_ERROR_SUMMARY_MAX
    ? summary.slice(0, MP_ERROR_SUMMARY_MAX) + '…'
    : summary || String(err)
}
