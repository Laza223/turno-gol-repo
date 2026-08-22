import * as Sentry from '@sentry/nextjs'
import { scrubObject, scrubQueryString } from '@/lib/sentry-pii-scrub'
import { isValidDsn, isDroppableDomainError } from '@/lib/sentry-event-filter'
import { registerSentryErrorSink } from '@/shared/observability/error-sink'

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
// Create these Metric Alerts (dataset = Transactions, env = production):
//
//   1) Error rate > 5%
//      Metric:    failure_rate()
//      Trigger:   Critical when failure_rate() > 0.05 over a 5-minute window
//      Notify:    on-call channel (Slack / email)
//
//   2) Latencia por presupuesto — UNA alerta por operación, NO una global.
//
//      Acá había un solo `p95(transaction.duration) > 2000ms` para todo. Ese
//      umbral es el del presupuesto MÁS FLOJO de doc5 §2 (reportes, 2s), así
//      que la grilla —cuyo presupuesto es 500ms— podía correr a 4× lo permitido
//      sin que sonara nada. Un solo número para seis presupuestos distintos
//      alerta con el peor de todos (B11).
//
//      Los valores salen de `src/shared/observability/latency-budgets.ts`, que
//      es la fuente única y está atada a doc5 por
//      `tests/unit/latency-budgets.test.ts`. Copiar de ahí, no de acá:
//
//        Operación                       p95      transaction
//        ────────────────────────────────────────────────────────────────────
//        Grilla de disponibilidad        500ms    /grilla
//                                                 GET /api/public/availability
//        Reserva manual (admin)         1500ms    POST /reservas
//        Reserva online (jugador)       2000ms    POST /[slug]/reservar
//        Dashboard admin                 800ms    /dashboard
//        Búsqueda de canchas             600ms    /explorar
//                                                 GET /api/public/search
//        Reportes                       2000ms    /reportes
//                                                 GET /api/reports/revenue
//
//      Ojo con el sample rate al leer los percentiles: `tracesSampler` de abajo
//      manda 0.5 en webhooks, 0.3 en /api/bookings y 0.1 en el resto. Un p95
//      sobre 10% de las requests es una estimación, no el valor exacto — con
//      poco tráfico conviene mirar ventanas más largas antes de creerle.
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
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: 'Sentry DSN invalid, skipping init',
    }) + '\n',
  )
}

if (isValidDsn(dsn)) {
  // Todo `logger.error` del runtime web pasa a reportarse (ver error-sink.ts).
  // Va antes del init a propósito: `captureMessage` sobre un SDK todavía sin
  // inicializar es un no-op, pero un error durante el propio `init` sí llega.
  registerSentryErrorSink()
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
