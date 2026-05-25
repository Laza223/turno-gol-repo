import * as Sentry from '@sentry/nextjs'
import { scrubObject, scrubQueryString } from '@/lib/sentry-pii-scrub'

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

    // PII scrub (Ley 25.326 / B9 audit) — never let email, phone, MP tokens,
    // or auth headers leak into error reports.
    if (event.request) {
      delete event.request.data
      if (event.request.headers) {
        const h = event.request.headers as Record<string, string>
        delete h.cookie
        delete h.Cookie
        delete h.authorization
        delete h.Authorization
      }
      if (typeof event.request.query_string === 'string') {
        event.request.query_string = scrubQueryString(event.request.query_string)
      }
    }
    if (event.extra) event.extra = scrubObject(event.extra) as typeof event.extra
    if (event.contexts) {
      event.contexts = scrubObject(event.contexts) as typeof event.contexts
    }
    if (event.user) {
      // Keep id for traceability, drop email/username/ip_address.
      event.user = { id: event.user.id }
    }
    return event
  },
})
