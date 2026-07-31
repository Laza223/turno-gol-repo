import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sentry PRIMERO, y la validación de env después y sin relanzar. El orden
    // inverso —validar y después importar la config— tuvo un costo medido:
    //
    // `ENCRYPTION_KEY` nunca estuvo seteada en el entorno de Production de
    // Vercel, así que `validateServerEnv` tiraba acá, `register()` cortaba, y
    // `sentry.server.config` NUNCA se importaba. Resultado: producción corrió
    // desde el primer día SIN reporte de errores de servidor. Se descubrió el
    // 2026-07-31 pidiendo los issues de 14 días: 8, todos del navegador, cero
    // del servidor — incluido el 500 de /api/mp/callback que ese mismo día
    // impedía a cualquier complejo conectar su cuenta de cobro. Lo agarraron
    // los logs de Vercel; Sentry no lo vio nunca.
    //
    // La trampa de fondo: el validador de env mataba justamente la herramienta
    // que tenía que avisar que el env estaba mal. Y no era ni siquiera un
    // fail-fast real — Next se come la excepción de `register()` y la app
    // sigue sirviendo igual, solo que ciega.
    //
    // Sentry v8+: las configs de server/edge dejaron de auto-cargarse por
    // convención de nombre; hay que importarlas explícitamente desde acá.
    await import('./sentry.server.config')

    const { validateServerEnv } = await import('./src/shared/env')
    try {
      validateServerEnv(process.env)
    } catch (err) {
      // Reportar, no tumbar. Un env incompleto se sigue notando —y ahora en
      // voz alta, con nombre y apellido de cada variable— pero sin apagar el
      // canal por el que se entera.
      Sentry.captureException(err)
      console.error('[env] validación del entorno FALLIDA — la app arranca igual, degradada:', err)
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Hook de Next 15+. Sin esto, los errores de Server Components, Server Actions y
// route handlers no llegan a Sentry.
export const onRequestError = Sentry.captureRequestError
