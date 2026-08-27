import * as Sentry from '@sentry/nextjs'
import { scrubObject, scrubQueryString } from '@/lib/sentry-pii-scrub'
import { isValidDsn, isDroppableDomainError } from '@/lib/sentry-event-filter'
import { registerSentryErrorSink } from './error-sink'

/**
 * Arranque de Sentry para el runtime WEB (Vercel).
 *
 * ─── Por qué vive acá y no dentro de `sentry.server.config.ts` ───────────────
 *
 * Porque `instrumentation.ts` —el único que cargaba esa config— **NO CORRE en
 * el runtime de Vercel**. Medido el 2026-08-27 con `probeSentrySdk` contra
 * producción:
 *
 *   sentry-sdk: fail — "Sentry.init() no dejó un cliente activo en este runtime"
 *
 * Segunda señal, en la MISMA invocación (arranque en frío recién provocado): el
 * visor de logs de Vercel muestra el request con la columna Messages vacía —
 * falta el `console.info('instrumentation ok')` que `register()` escribe al
 * final. O sea: `register()` no se ejecuta.
 *
 * Consecuencia: los ~84 `captureException`/`captureMessage` del web iban a un
 * SDK sin inicializar, que es un no-op silencioso. Producción no reportó un
 * solo error de servidor durante semanas.
 *
 * Antes de llegar acá se descartaron, CADA UNO CON MEDICIÓN: el flush (#232),
 * el orden de arranque (#233), el valor del DSN y la red (`probeSentry` entrega
 * e ingiere), el túnel `/monitoring` (anda; el 404 era una sonda mal apuntada),
 * la ubicación del archivo (la raíz es válida) y el Tracing de Vercel (sin
 * reglas). Ver `docs/audit/2026-08-25-auditoria-infra.md` §19.
 *
 * ─── Por qué este patrón y no otro ───────────────────────────────────────────
 *
 * No es un rodeo: es el mismo mecanismo que YA FUNCIONA en el worker de
 * Railway, que sí reporta. Ahí `initWorkerSentry()` (`sentry-worker.ts`) se
 * llama desde `run-workers.ts`, o sea desde el grafo normal de módulos, no
 * desde un hook del framework. Acá se hace igual: `src/lib/sentry.ts` —que
 * importan los ~84 call sites— llama a `ensureWebSentry()` antes de capturar.
 *
 * `sentry.server.config.ts` sigue existiendo y sigue llamando a esto, para el
 * día que `register()` vuelva a correr (o corra en otro entorno, como
 * `next start` local, donde SÍ corre). Las dos vías son idempotentes: si ya hay
 * cliente, esto no hace nada.
 */

/** `true` si quedó un cliente activo (recién creado o de una llamada previa). */
export function ensureWebSentry(): boolean {
  // Idempotente y barato: es lo que permite llamarlo en cada captura sin
  // pensarlo, y lo que evita que pise el init del worker de Railway, que ya
  // dejó su propio cliente con OTRA config (sin `tracesSampler`).
  if (Sentry.getClient()) return true

  const dsn = process.env.SENTRY_DSN

  if (dsn && !isValidDsn(dsn)) {
    // `console`, no `process.stderr`: este módulo lo importa código que también
    // se compila para el runtime edge, donde esa API no existe — ver el
    // comentario de `bootLog` en instrumentation.ts.
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        module: 'sentry-web-init',
        message: 'Sentry DSN invalid, skipping init',
      }),
    )
    return false
  }

  if (!isValidDsn(dsn)) return false

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
  return true
}
