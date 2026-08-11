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
 * True when a MercadoPago error represents an expired/invalid access token
 * (HTTP 401). Handles the raw SDK error shape (`status`/`statusCode`), a nested
 * `cause`, and a 401/"unauthorized" message fallback.
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

  const msg = typeof e.message === 'string' ? e.message : ''
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
