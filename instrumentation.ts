import * as Sentry from '@sentry/nextjs'

/**
 * Log directo a stderr, sin pasar por `logger` ni por Sentry.
 *
 * Existe porque esto tiene que poder gritar JUSTO cuando la observabilidad es
 * lo que está roto: si el reporte de un fallo de arranque dependiera de Sentry,
 * y Sentry no arrancó, el fallo volvería a ser mudo. Mismo idioma que el warn
 * de DSN inválido de `sentry.server.config.ts`.
 */
function bootLog(level: 'info' | 'error', message: string, extra?: Record<string, unknown>): void {
  process.stderr.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      module: 'instrumentation',
      message,
      ...extra,
    }) + '\n',
  )
}

/**
 * ORDEN DELIBERADO — no reordenar sin leer esto.
 *
 * Hasta el 2026-08-26 este hook empezaba con `validateServerEnv()`, que TIRA si
 * falta o está mal una variable de producción. Todo lo de abajo —el init de
 * Sentry, el locale de Zod, el sink de analytics— quedaba sin ejecutar, y sin
 * Sentry el propio fallo no se reportaba: el modo de falla era "la app anda y
 * no avisa de nada". Medido: en 14 días Sentry no tenía UN SOLO evento del
 * runtime de servidor de Vercel (sí del worker de Railway y del navegador), y
 * `analytics_events` no tenía una sola fila de categoría web. Control: el MISMO
 * commit, en build de producción local, sí emite el rastro de Sentry y sí
 * transmite el evento — o sea que no es el bundle, es el entorno.
 * Ver docs/audit/2026-08-25-auditoria-infra.md §19.
 *
 * Ahora se cablea primero lo que NO tiene requisitos —Sentry solo necesita
 * `SENTRY_DSN`; el locale y el sink no necesitan nada— y el validador va
 * ÚLTIMO. Sigue tirando igual que antes (es un gate de arranque a propósito),
 * pero para cuando tira ya hay quien lo cuente.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1. Sentry primero: es el único canal que convierte un fallo de arranque
    // en un aviso a una persona.
    await import('./sentry.server.config')

    // 2. Cosas sin requisitos de entorno. El try/catch de cada una es para que
    // ninguna se lleve puesta a la siguiente.
    try {
      const { installZodLocale } = await import('./src/shared/validation/zod-locale')
      installZodLocale()
    } catch (err) {
      bootLog('error', 'zod locale failed')
      Sentry.captureException(err)
    }

    // Conecta `track.*` con su destino durable (migr. 072).
    try {
      const { setAnalyticsSink } = await import('./src/shared/observability/breadcrumbs')
      const { recordEvent } = await import('./src/shared/observability/analytics')
      setAnalyticsSink(recordEvent)
    } catch (err) {
      bootLog('error', 'analytics sink failed')
      Sentry.captureException(err)
    }

    // 3. El gate de configuración, al final y RUIDOSO. Sigue tirando: una
    // variable mal puesta tiene que romper el arranque, no degradarlo en
    // silencio. La diferencia con antes es que ahora se entera alguien.
    try {
      const { validateServerEnv } = await import('./src/shared/env')
      validateServerEnv(process.env)
      bootLog('info', 'instrumentation ok')
    } catch (err) {
      // El mensaje de `validateServerEnv` lista los NOMBRES de las variables
      // que fallaron y el porqué; nunca sus valores (ver src/shared/env.ts).
      bootLog('error', 'server env invalid', {
        error: err instanceof Error ? err.message : String(err),
      })
      Sentry.captureException(err)
      throw err
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Hook de Next 15+. Sin esto, los errores de Server Components, Server Actions y
// route handlers no llegan a Sentry.
export const onRequestError = Sentry.captureRequestError
