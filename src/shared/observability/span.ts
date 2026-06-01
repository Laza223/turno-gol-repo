import { startSpan } from '@sentry/nextjs'

/**
 * Wrap an async unit of work in a Sentry performance span. The span attaches to
 * the active transaction that @sentry/nextjs auto-creates for route handlers and
 * server actions, so the operation shows up with its own timing in Sentry
 * Performance. Errors propagate unchanged (the span is marked failed by the SDK).
 *
 * `op` follows Sentry's span-operation convention (e.g. 'db.query',
 * 'booking.create') so spans group sensibly in the Performance UI.
 *
 * No-op cost when Sentry is disabled (invalid/absent DSN): startSpan still runs
 * the callback and returns its result, it just doesn't record.
 */
export function withSpan<T>(name: string, op: string, fn: () => Promise<T>): Promise<T> {
  return startSpan({ name, op }, () => fn())
}
