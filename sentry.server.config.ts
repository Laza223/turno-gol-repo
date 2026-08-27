import { ensureWebSentry } from '@/shared/observability/sentry-web-init'

// ─────────────────────────────────────────────────────────────────────────
// ALERTS (doc17 §Observabilidad) — configured in the Sentry UI, NOT in code.
//
// Sentry's SDK cannot declare alert rules; they live in the project dashboard
// (Settings → Alerts → Create Alert). The data they need is already emitted by
// `sentry-web-init.ts`: its `tracesSampler` produces the transactions for
// latency
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
//      Ojo con el sample rate al leer los percentiles: el `tracesSampler` de
//      `sentry-web-init.ts` manda 0.5 en webhooks, 0.3 en /api/bookings y 0.1
//      en el resto. Un p95 sobre 10% de las requests es una estimación, no el
//      valor exacto — con poco tráfico conviene mirar ventanas más largas antes de creerle.
//
// Related (separate from this file): pg-boss queue depth > 100 is exposed by
// GET /api/admin/jobs; alert on it via an uptime/synthetic check or the
// Sentry cron-monitor, not via transaction metrics.
//
// To codify these instead of clicking, provision them with the Sentry API /
// Terraform provider — out of scope for v1 (kept as UI config per decision).
// ─────────────────────────────────────────────────────────────────────────

// El init REAL vive en `src/shared/observability/sentry-web-init.ts`, dentro del
// grafo de la app, porque este archivo solo lo carga `instrumentation.ts` y ESE
// HOOK NO CORRE en el runtime de Vercel (medido, ver §19 del doc de auditoría y
// el docstring de ese módulo). Acá queda la llamada para los entornos donde
// `register()` sí corre — `next start` local, por ejemplo. Es idempotente: si
// el cliente ya existe, no hace nada.
ensureWebSentry()
