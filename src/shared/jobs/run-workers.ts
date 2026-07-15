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
import { assertWorkerDbVisibility } from '@/shared/db/client'
import { logger } from '@/shared/lib/logger'

/**
 * Standalone Node entrypoint. Starts pg-boss + registers every worker.
 * Run via `pnpm jobs:start`. Decoupled from the Next.js server lifecycle so
 * webhook processing keeps running through web restarts.
 */
async function main(): Promise<void> {
  // Fail fast (Fable 5 P0) if the worker DB role can't see across tenants —
  // otherwise every cron below just silently processes 0 rows forever.
  await assertWorkerDbVisibility()
  const boss = await getBoss()
  await registerAllWorkers(boss)
  logger.info('running. Ctrl+C to stop.', { module: 'workers' })

  const shutdown = async (signal: string) => {
    logger.info('received signal, stopping...', { module: 'workers', signal })
    await stopBoss()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.error('fatal', { module: 'workers', error: err instanceof Error ? err.message : String(err) })
  process.exit(1)
})
