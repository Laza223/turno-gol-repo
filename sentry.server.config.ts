import * as Sentry from '@sentry/nextjs'
import { scrubObject, scrubQueryString } from '@/lib/sentry-pii-scrub'
import { isValidDsn, isDroppableDomainError } from '@/lib/sentry-event-filter'

// ─────────────────────────────────────────────────────────────────────────
// ALERTS (doc17 §Observabilidad) — configured in the Sentry UI, NOT in code.
//
// Sentry's SDK cannot declare alert rules; they live in the project dashboard
// (Settings → Alerts → Create Alert). The data they need is already emitted by
// this file: `tracesSampler` below produces the transactions for latency
// percentiles + failure rate, and `Sentry.captureException` (here + dlq.ts)
// produces the error events. Spans added via `withSpan` and the tags set in
// src/shared/middleware/observability.ts (tenant_id, request_id, user_type)
// let you scope/group any alert.
//
// Create these two Metric Alerts (dataset = Transactions, env = production):
//
//   1) Error rate > 5%
//      Metric:    failure_rate()
//      Trigger:   Critical when failure_rate() > 0.05 over a 5-minute window
//      Notify:    on-call channel (Slack / email)
//
//   2) Latency P95 > 2s
//      Metric:    p95(transaction.duration)
//      Trigger:   Critical when p95 > 2000ms over a 5-minute window
//      (Tip: add a separate alert filtered to `transaction:/api/bookings*` and
//       `/api/webhooks*` — those carry the 0.3/0.5 sample rates below and are
//       the revenue path, so they deserve a tighter threshold.)
//
// Related (separate from this file): pg-boss queue depth > 100 is exposed by
// GET /api/admin/jobs; alert on it via an uptime/synthetic check or the
// Sentry cron-monitor, not via transaction metrics.
//
// To codify these instead of clicking, provision them with the Sentry API /
// Terraform provider — out of scope for v1 (kept as UI config per decision).
// ─────────────────────────────────────────────────────────────────────────

const dsn = process.env.SENTRY_DSN

if (dsn && !isValidDsn(dsn)) {
  process.stderr.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', message: 'Sentry DSN invalid, skipping init' }) + '\n',
  )
}

if (isValidDsn(dsn)) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: (samplingContext) => {
      // Sentry v8 sacó `transactionContext` de SamplingContext: el nombre de la
      // transacción ahora viene directo en `samplingContext.name`. Si se dejaba
      // el acceso viejo quedaba `undefined` y TODO el sampling por ruta colapsaba
      // en silencio al 0.1 de abajo — los webhooks de MP perdían la mitad de su
      // traza sin que nada fallara.
      const name = samplingContext.name ?? ''
      if (name.includes('/api/health') || name.includes('/api/status')) return 0
      if (name.includes('/api/webhooks')) return 0.5
      if (name.includes('/api/bookings')) return 0.3
      return 0.1
    },
    beforeSend(event, hint) {
      if (isDroppableDomainError(hint)) return null

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
}
