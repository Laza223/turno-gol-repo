import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateServerEnv } = await import('./src/shared/env')
    validateServerEnv(process.env)
    // Sentry v8+: las configs de server/edge dejaron de auto-cargarse por
    // convención de nombre. Hay que importarlas explícitamente desde register().
    await import('./sentry.server.config')

    const { installZodLocale } = await import('./src/shared/validation/zod-locale')
    installZodLocale()

    // Conecta `track.*` con su destino durable (migr. 072). Va DESPUÉS de
    // sentry.server.config a propósito: si esto llegara a tirar, un throw más
    // arriba dejaría a Sentry sin instalar y la app ciega a sus propios errores
    // — que es exactamente el modo de falla que ya se pagó una vez.
    // El try/catch es la segunda red: sin instrumentación se puede vivir, sin
    // servidor no.
    try {
      const { setAnalyticsSink } = await import('./src/shared/observability/breadcrumbs')
      const { recordEvent } = await import('./src/shared/observability/analytics')
      setAnalyticsSink(recordEvent)
    } catch (err) {
      Sentry.captureException(err)
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Hook de Next 15+. Sin esto, los errores de Server Components, Server Actions y
// route handlers no llegan a Sentry.
export const onRequestError = Sentry.captureRequestError
