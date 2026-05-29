import * as Sentry from '@sentry/nextjs'
import { isValidDsn, isDroppableDomainError } from '@/lib/sentry-event-filter'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * F12 audit 2026-05-29: remove Replay to reduce shared bundle (~40KB).
 * Errors still capture with stack+breadcrumbs+tracesSampleRate; we lose
 * session video replay. Reactivate if support needs visual debugging.
 *
 * Exported as a pure function so unit tests can assert filtering logic
 * without triggering Sentry.init side-effects.
 */
export function filterReplay<T extends { name: string }>(integrations: T[]): T[] {
  return integrations.filter((i) => i.name !== 'Replay' && i.name !== 'ReplayIntegration')
}

if (isValidDsn(dsn)) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    integrations: filterReplay,
    ignoreErrors: [
      'AbortError',
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      'NavigationDuplicated',
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
    ],
    beforeSend(event, hint) {
      if (isDroppableDomainError(hint)) return null
      if (process.env.NODE_ENV !== 'production') return null
      return event
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'ui.click') return null
      return breadcrumb
    },
  })
}
