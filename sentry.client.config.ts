import * as Sentry from '@sentry/nextjs'
import { isValidDsn, isDroppableDomainError } from '@/lib/sentry-event-filter'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (isValidDsn(dsn)) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
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
