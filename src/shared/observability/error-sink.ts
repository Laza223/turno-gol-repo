import * as Sentry from '@sentry/nextjs'
import { setErrorSink } from '@/shared/lib/logger'

/**
 * Conecta `logger.error` con Sentry.
 *
 * Lo llaman los DOS entrypoints que inicializan el SDK, cada uno para su
 * runtime: `sentry.server.config.ts` (web, vía instrumentation.ts) y
 * `initWorkerSentry()` (proceso de workers de Railway). Siempre DESPUÉS del
 * `Sentry.init` y solo si el DSN es válido — registrar sobre un SDK sin init
 * sería cambiar "ciego" por "ciego y con ruido".
 *
 * Este archivo existe separado para que el SDK de Sentry entre por acá y no
 * por `logger.ts`, que lo importa medio codebase (ver el comentario del sink
 * allá: importarlo ahí duplicaba con creces el tiempo de la suite).
 *
 * La entrada entera va como `extra` a propósito, y no en `tags` ni pegada al
 * mensaje: `extra` es la clave que los dos `beforeSend` pasan por
 * `scrubObject` (Ley 25.326, doc18), que es lo que mantiene afuera emails,
 * teléfonos y tokens de MercadoPago. El `message` va aparte y sin interpolar
 * nada, para que Sentry agrupe por tipo de fallo y no una issue por evento.
 *
 * Duplica el reporte en los sitios que YA llaman a `captureException` a mano:
 * ese evento trae el stack y este el contexto estructurado, así que la suma
 * nunca informa menos. Cambiar 23 fallos mudos por algunos repetidos es el
 * mejor de los dos negocios.
 */
export function registerSentryErrorSink(): void {
  setErrorSink((message, entry) => {
    Sentry.captureMessage(message, { level: 'error', extra: entry })
  })
}
