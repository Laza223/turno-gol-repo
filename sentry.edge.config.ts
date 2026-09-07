import * as Sentry from '@sentry/nextjs'
import { isValidDsn, isDroppableDomainError } from '@/lib/sentry-event-filter'
import { scrubEvent } from '@/lib/sentry-pii-scrub'

const dsn = process.env.SENTRY_DSN

if (dsn && !isValidDsn(dsn)) {
  // console.warn y no process.stderr.write: el Edge runtime no tiene `stderr`.
  // Antes esto no molestaba porque Sentry v7 cargaba sentry.edge.config.ts por su
  // cuenta; desde v8 lo importa instrumentation.ts, así que Next lo compila como
  // Edge Instrumentation y el análisis estático marca el acceso a process.stderr
  // ("Ecmascript file had an error"), aunque estuviera guardado en runtime.
  console.warn(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: 'Sentry DSN invalid, skipping init',
    }),
  )
}

if (isValidDsn(dsn)) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    beforeSend(event, hint) {
      if (isDroppableDomainError(hint)) return null
      // El cuarto entrypoint del reporte de errores, y el único que no tapaba
      // NADA (AUD-14). Misma función que el navegador, el web y los workers.
      scrubEvent(event)
      return event
    },
  })
}
