/** A valid Sentry DSN: parseable URL, http(s), with a public key (username). */
export function isValidDsn(dsn: string | undefined | null): dsn is string {
  if (!dsn) return false
  try {
    const u = new URL(dsn)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.username.length > 0
  } catch {
    return false
  }
}

/** Names of domain-level errors that are expected business outcomes, not bugs — never alert on these. */
const DROPPABLE_ERROR_NAMES = new Set(['InvalidTransitionError'])

/** True if the captured exception is a domain error we deliberately don't report. Duck-typed by name to stay edge-safe and decoupled from server modules. */
export function isDroppableDomainError(hint: { originalException?: unknown } | undefined): boolean {
  const err = hint?.originalException
  return err instanceof Error && DROPPABLE_ERROR_NAMES.has(err.name)
}
