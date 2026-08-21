import * as Sentry from '@sentry/nextjs'
import { scrubObject } from '@/lib/sentry-pii-scrub'
import { isValidDsn, isDroppableDomainError } from '@/lib/sentry-event-filter'
import { logger } from '@/shared/lib/logger'

/**
 * Inicializa Sentry en el proceso STANDALONE de workers (Railway).
 *
 * Por qué existe: `sentry.server.config.ts` es una convención de Next y lo
 * carga `instrumentation.ts`, o sea SOLO el runtime web de Vercel. El proceso
 * de `run-workers.ts` nunca lo importó, así que estaba completamente ciego:
 * todos los `logger.error` de los 14 workers iban al stderr de Railway y nada
 * más, y `attachFailureHandlers` (dlq.ts) llamaba a `Sentry.captureException`
 * sobre un SDK sin inicializar — o sea a la nada. Así fue como un pago
 * aprobado sin reserva sobrevivió 5 horas sin que sonara nada (2026-08-18).
 * Ver también [[sentry-server-nunca-reporto-instrumentation]].
 *
 * NO tira nunca ni deja tirar: que la observabilidad falle no puede impedir que
 * arranquen los workers — sería cambiar "ciego" por "muerto". Devuelve si
 * quedó activo, para que el arranque lo deje dicho en el log.
 *
 * No configura `tracesSampler`: acá no hay transacciones HTTP que muestrear,
 * y las rutas contra las que decide el del web no existen en este proceso.
 */
export function initWorkerSentry(): boolean {
  try {
    const dsn = process.env.SENTRY_DSN
    if (!isValidDsn(dsn)) return false

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      release: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
      // Distingue en Sentry lo que rompe en los crons de lo que rompe en el
      // request del usuario: comparten proyecto y muchos comparten stack.
      initialScope: { tags: { runtime: 'worker' } },
      beforeSend(event, hint) {
        if (isDroppableDomainError(hint)) return null
        if (process.env.NODE_ENV !== 'production') return null
        // Mismo scrub PII que el runtime web (Ley 25.326): los workers pasan
        // emails, teléfonos y tokens de MP por `extra` sin pensarlo.
        if (event.extra) event.extra = scrubObject(event.extra) as typeof event.extra
        if (event.contexts) event.contexts = scrubObject(event.contexts) as typeof event.contexts
        if (event.user) event.user = { id: event.user.id }
        return event
      },
    })
    return true
  } catch (err) {
    logger.error('sentry init failed, workers arrancan sin reporte de errores', {
      module: 'workers',
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Vacía la cola de Sentry antes de que el proceso muera. Sin esto, el error que
 * MATA al worker es justo el que no llega: `Sentry.captureException` encola y
 * el `process.exit` se lo lleva puesto.
 */
export async function flushWorkerSentry(timeoutMs = 2000): Promise<void> {
  try {
    await Sentry.flush(timeoutMs)
  } catch {
    /* nada que hacer: ya estamos apagando */
  }
}
