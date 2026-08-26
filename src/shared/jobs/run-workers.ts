// ENS-17: `tsx` (nuestro runner de `pnpm jobs:start`) NO carga `.env.local`
// por su cuenta —a diferencia de `next dev`—, así que en dev local los
// workers arrancaban con ENCRYPTION_KEY/RESEND_API_KEY inválidos (los del
// shell, o vacíos) y fallaban en silencio recién al procesar un job real.
// `process.loadEnvFile` (Node ≥20.6; este repo corre Node 24) NO pisa
// variables ya definidas en el entorno (confirmado empíricamente contra el
// Node de este repo: setear FOO en process.env antes de loadEnvFile y tener
// FOO en el archivo deja el valor de process.env intacto) — en Railway
// (prod, `NODE_ENV=production`, env real del dashboard) este bloque directamente
// no corre.
//
// OJO con el orden real de ejecución: los `import` estáticos de abajo se
// resuelven y ejecutan ANTES que este bloque (hoisting de ESM — confirmado
// empíricamente con tsx: un módulo importado imprime su top-level antes que
// cualquier código escrito arriba suyo en este archivo). Esto es seguro hoy
// porque ningún módulo bajo `./boss`, `./workers`, `@/shared/db/client` ni
// `@/shared/lib/logger` lee `process.env.*` en su nivel superior — todas las
// lecturas relevantes (DATABASE_URL, ENCRYPTION_KEY, RESEND_API_KEY) ocurren
// dentro de funciones que corren recién cuando `main()` las invoca, después
// de este bloque. Si algún día se agrega una lectura de env var a nivel de
// módulo en ese árbol de imports, este orden dejaría de alcanzar.
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env.local')
  } catch {
    /* .env.local ausente (ej. CI): seguir con el entorno tal cual está */
  }
}

import { getBoss, stopBoss } from './boss'
import { registerAllWorkers } from './workers'
import { assertAppDbReachable, assertWorkerDbVisibility } from '@/shared/db/client'
import { startHealthServer } from './health-server'
import { logger } from '@/shared/lib/logger'

/**
 * Standalone Node entrypoint. Starts pg-boss + registers every worker.
 * Run via `pnpm jobs:start`. Decoupled from the Next.js server lifecycle so
 * webhook processing keeps running through web restarts.
 */
async function main(): Promise<void> {
  // Conecta `track.*` con `analytics_events` (migr. 072). Los workers emiten
  // eventos igual que el servidor web (reconciliación, expiración, webhooks),
  // y sin este registro serían el único lugar donde la instrumentación no mide.
  //
  // Import dinámico y acá adentro, no arriba: los `import` estáticos de este
  // archivo se resuelven ANTES del bloque de `loadEnvFile` (ver el comentario
  // del encabezado), y este módulo sí termina leyendo `WORKER_DATABASE_URL`.
  // Sentry PRIMERO, antes de cualquier cosa que pueda tirar: si
  // `assertWorkerDbVisibility` o `getBoss` explotan, ese error tiene que
  // llegar a algún lado. Import dinámico por el mismo motivo que los de abajo
  // (el bloque de `loadEnvFile` corre después de los `import` estáticos y este
  // módulo lee SENTRY_DSN).
  const { initWorkerSentry } = await import('@/shared/observability/sentry-worker')
  const sentryEnabled = initWorkerSentry()
  logger.info('sentry', { module: 'workers', enabled: sentryEnabled })

  const { setAnalyticsSink } = await import('@/shared/observability/breadcrumbs')
  const { recordEvent } = await import('@/shared/observability/analytics')
  setAnalyticsSink(recordEvent)

  // Fail fast (Fable 5 P0) if the worker DB role can't see across tenants —
  // otherwise every cron below just silently processes 0 rows forever.
  await assertWorkerDbVisibility()
  // Y el pool RESTRINGIDO, que es el que se rompio el 2026-08-25 mientras el de
  // arriba daba verde: son DSN distintos y solo uno se estaba mirando.
  await assertAppDbReachable()
  const boss = await getBoss()
  await registerAllWorkers(boss)

  // Despues de registrar las colas: un healthcheck que contesta 200 con las
  // colas sin consumidor estaria certificando justo lo que no queremos.
  const healthServer = startHealthServer(boss)
  logger.info('running. Ctrl+C to stop.', { module: 'workers' })

  const shutdown = async (signal: string) => {
    logger.info('received signal, stopping...', { module: 'workers', signal })
    healthServer?.close()
    await stopBoss()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch(async (err) => {
  logger.error('fatal', {
    module: 'workers',
    error: err instanceof Error ? err.message : String(err),
  })
  // Un arranque que falla dejaba TODOS los crons muertos sin una sola señal
  // fuera del stderr de Railway. `flush` antes del exit: capturar sin vaciar
  // la cola no manda nada.
  try {
    const { captureException } = await import('@/lib/sentry')
    const { flushWorkerSentry } = await import('@/shared/observability/sentry-worker')
    captureException(err, { extra: { module: 'workers', phase: 'boot' } })
    await flushWorkerSentry()
  } catch {
    /* si ni esto anda, el log de arriba es todo lo que hay */
  }
  process.exit(1)
})
