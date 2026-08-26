import { after } from 'next/server'
import * as Sentry from '@sentry/nextjs'

/**
 * Reexporta captureException/captureMessage de @sentry/nextjs, pero
 * garantizando la entrega antes de que la función serverless de Vercel se
 * congele.
 *
 * El simulacro de P-12 (2026-08-26, docs/audit/2026-08-25-auditoria-infra.md
 * §17) disparó ~10 `captureException` en `/api/status` durante los 503 y
 * CERO llegaron a Sentry — con `SENTRY_DSN` presente y válido en Vercel
 * Production (verificado en el dashboard, no solo en el código). La causa:
 * `captureException` solo ENCOLA el evento, un transporte HTTP asíncrono lo
 * despacha, y nadie esperaba esa promesa — Vercel congela la función en
 * cuanto la response sale. La instrumentación automática de @sentry/nextjs
 * que normalmente cubriría esto depende de Turbopack, que la resuelve vía
 * "telemetry" de Next en vez de la inyección de Webpack (docs de Sentry,
 * manual-setup/webpack-setup) — no hay garantía de que cubra este caso, y la
 * evidencia del simulacro dice que no.
 *
 * `after()` corre el flush DESPUÉS de que la respuesta ya salió (mismo patrón
 * que src/shared/observability/analytics.ts), así que no le suma latencia a
 * nadie en el camino feliz. Afuera de un request tira
 * `Error: after() was called outside a request scope` — es el caso de los
 * call sites en src/shared/jobs/workers (proceso standalone de Railway): ahí
 * no hace falta, el worker no se congela entre eventos y ya vive bajo su
 * propio Sentry.init (sentry-worker.ts).
 */
function flushAfterResponse(): void {
  try {
    after(() => {
      void Sentry.flush(2000)
    })
  } catch {
    // Fuera de request scope (workers): no hace falta, ver arriba.
  }
}

export function captureException(
  ...args: Parameters<typeof Sentry.captureException>
): ReturnType<typeof Sentry.captureException> {
  const eventId = Sentry.captureException(...args)
  flushAfterResponse()
  return eventId
}

export function captureMessage(
  ...args: Parameters<typeof Sentry.captureMessage>
): ReturnType<typeof Sentry.captureMessage> {
  const eventId = Sentry.captureMessage(...args)
  flushAfterResponse()
  return eventId
}
