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
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Hook de Next 15+. Sin esto, los errores de Server Components, Server Actions y
// route handlers no llegan a Sentry.
export const onRequestError = Sentry.captureRequestError
