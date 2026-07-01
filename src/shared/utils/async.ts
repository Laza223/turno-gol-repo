/**
 * Client-side async safety helpers.
 *
 * Root cause of the recurring "queda cargando" UI bugs: a loading flag is set
 * to true before awaiting a promise that can hang forever (a service worker
 * that never activates, a fetch with no network reply, a permission prompt the
 * user dismisses), with no escape hatch back to an error state. These helpers
 * guarantee every awaited operation either resolves, rejects, or times out — so
 * the caller can always clear its loading flag.
 */

/** Error thrown by {@link withTimeout} when the deadline elapses. */
class TimeoutError extends Error {
  constructor(message = 'La operación tardó demasiado') {
    super(message)
    this.name = 'TimeoutError'
  }
}

/**
 * Races `promise` against a timeout. If `promise` does not settle within `ms`,
 * the returned promise rejects with a {@link TimeoutError}. The underlying
 * promise is NOT cancelled (JS promises are not cancellable) — this only frees
 * the caller from waiting on it. Use for non-abortable APIs such as
 * `navigator.serviceWorker.ready` or `Notification.requestPermission()`.
 *
 * @param promise the operation to bound
 * @param ms timeout in milliseconds
 * @param message optional custom timeout message
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

/**
 * `fetch` with an automatic abort after `ms`. Uses `AbortSignal.timeout` when
 * available (modern browsers) and falls back to a manual `AbortController` for
 * older runtimes. Any caller-supplied `signal` is respected: if it aborts, the
 * request aborts too.
 *
 * @param input request URL or Request
 * @param init standard fetch init; `init.signal` is combined with the timeout
 * @param ms timeout in milliseconds (default 8000)
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  ms = 8000,
): Promise<Response> {
  // Prefer the native static factory when present.
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    const timeoutSignal = AbortSignal.timeout(ms)
    // If the caller passed a signal, combine both via AbortSignal.any when available.
    const signal =
      init.signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([init.signal, timeoutSignal])
        : init.signal ?? timeoutSignal
    return fetch(input, { ...init, signal })
  }

  // Fallback: manual controller + setTimeout.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new TimeoutError()), ms)
  if (init.signal) {
    if (init.signal.aborted) controller.abort(init.signal.reason)
    else init.signal.addEventListener('abort', () => controller.abort(init.signal?.reason), { once: true })
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}
