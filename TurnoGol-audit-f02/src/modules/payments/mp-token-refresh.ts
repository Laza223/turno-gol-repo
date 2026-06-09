/**
 * Pure 401-detection + refresh-and-retry helpers (Hallazgo 4). No DB/SDK deps
 * so the gateway implementation and the OAuth service can both import them
 * without a cycle, and so the retry contract is directly unit-testable.
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
