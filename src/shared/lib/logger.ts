import { getRequestContext } from './request-context'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogMeta = Record<string, unknown>

/**
 * Destino al que se reenvía TODO lo que sale por `logger.error`.
 *
 * Por qué existe: `logger.error` solo escribía a stderr. En Vercel eso todavía
 * se lee; en el proceso standalone de workers (Railway) se lo lleva el viento.
 * Medido el 2026-08-22: el cron `retry-pending-refunds` venía fallando cada
 * hora contra el reembolso de un complejo —12 corridas en 26 h, ninguna
 * exitosa— y Sentry no tenía NI UN evento de reembolso en toda su historia. El
 * motivo real del fallo existía y estaba bien armado (`describeMpError`, en
 * retry-refunds.worker.ts): no lo leía nadie. Y 23 de los 38 `logger.error`
 * del código viven en `shared/jobs`, así que el agujero era de la clase
 * entera, no de ese worker.
 *
 * Por qué un sink y no `import * as Sentry` acá: este módulo lo importa medio
 * codebase, así que meterle el SDK adentro lo arrastra a todos los grafos de
 * import. MEDIDO: la suite unitaria pasó de 56,7 s a 135,8 s (el `collect` de
 * 24 s a 62 s) y un test se cayó por timeout. Registrándolo al revés —desde
 * los dos entrypoints, igual que `setAnalyticsSink` en breadcrumbs.ts— el
 * logger no importa Sentry nunca y el costo desaparece.
 *
 * En `globalThis` por el mismo motivo que el sink de analytics (F-022): con
 * una variable de módulo, el bundle de `instrumentation.ts` registra sobre SU
 * copia y los servicios leen otra, así que el registro no se vería. Ver
 * [[zod-locale-global-no-alcanza-schemas]].
 *
 * Sin sink registrado el logger se comporta igual que antes (solo stderr): la
 * observabilidad nunca condiciona al que loguea.
 */
type ErrorSink = (message: string, entry: Record<string, unknown>) => void

const SINK_KEY = '__turnogol_error_sink__'
type SinkHolder = { [SINK_KEY]?: ErrorSink | null }

export function setErrorSink(sink: ErrorSink | null): void {
  ;(globalThis as SinkHolder)[SINK_KEY] = sink
}

function getErrorSink(): ErrorSink | null {
  return (globalThis as SinkHolder)[SINK_KEY] ?? null
}

function emit(level: LogLevel, message: string, meta?: LogMeta): void {
  const ctx = getRequestContext()
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(ctx?.requestId ? { request_id: ctx.requestId } : {}),
    ...(ctx?.tenantId ? { tenant_id: ctx.tenantId } : {}),
    ...(ctx?.userId ? { user_id: ctx.userId } : {}),
    ...(ctx?.userType ? { user_type: ctx.userType } : {}),
    ...(meta ?? {}),
  }
  const line = JSON.stringify(entry)
  // `console`, NO `process.stdout`/`process.stderr`: este logger entra al grafo
  // del EDGE MIDDLEWARE (middleware.ts → rate-limit/apply.ts → @/lib/sentry →
  // sentry-web-init.ts → error-sink.ts → acá), y el runtime edge no tiene esas
  // APIs. Con ellas, el build de Turbopack falla entero con
  // "A Node.js API is used (process.stdout)". `console.log`/`console.error`
  // escriben a stdout/stderr igual en Node y existen en los dos runtimes, así
  // que además saca del camino la misma trampa para cualquier import futuro
  // desde el edge. Misma clase que el `bootLog` de instrumentation.ts.
  // `console` ya agrega el salto de línea.
  if (level !== 'error') {
    console.log(line)
    return
  }

  console.error(line)
  const sink = getErrorSink()
  if (!sink) return
  try {
    sink(message, entry)
  } catch {
    // Un sink roto no puede voltear al que estaba logueando un error.
  }
}

export const logger = {
  debug: (msg: string, meta?: LogMeta) => emit('debug', msg, meta),
  info: (msg: string, meta?: LogMeta) => emit('info', msg, meta),
  warn: (msg: string, meta?: LogMeta) => emit('warn', msg, meta),
  error: (msg: string, meta?: LogMeta) => emit('error', msg, meta),
}
