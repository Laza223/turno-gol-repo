import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampler: (samplingContext) => {
    const name = samplingContext.transactionContext?.name ?? ''
    if (name.includes('/api/health') || name.includes('/api/status')) return 0
    if (name.includes('/api/webhooks')) return 0.5
    if (name.includes('/api/bookings')) return 0.3
    return 0.1
  },
  beforeSend(event) {
    if (process.env.NODE_ENV !== 'production') return null
    return event
  },
})
