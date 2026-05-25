import * as Sentry from '@sentry/nextjs'
import { isValidDsn, isDroppableDomainError } from '@/lib/sentry-event-filter'

const dsn = process.env.SENTRY_DSN

if (dsn && !isValidDsn(dsn)) {
  if (typeof process !== 'undefined' && process.stderr) {
    process.stderr.write(
      JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', message: 'Sentry DSN invalid, skipping init' }) + '\n',
    )
  }
}

if (isValidDsn(dsn)) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    beforeSend(event, hint) {
      if (isDroppableDomainError(hint)) return null
      return event
    },
  })
}
