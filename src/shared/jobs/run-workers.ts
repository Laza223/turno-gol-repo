import { getBoss, stopBoss } from './boss'
import { registerAllWorkers } from './workers'

/**
 * Standalone Node entrypoint. Starts pg-boss + registers every worker.
 * Run via `pnpm jobs:start`. Decoupled from the Next.js server lifecycle so
 * webhook processing keeps running through web restarts.
 */
async function main(): Promise<void> {
  const boss = await getBoss()
  await registerAllWorkers(boss)
  console.log('[workers] running. Ctrl+C to stop.')

  const shutdown = async (signal: string) => {
    console.log(`[workers] received ${signal}, stopping...`)
    await stopBoss()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[workers] fatal', err)
  process.exit(1)
})
