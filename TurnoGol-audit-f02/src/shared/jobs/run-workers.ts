import { getBoss, stopBoss } from './boss'
import { registerAllWorkers } from './workers'
import { logger } from '@/shared/lib/logger'

/**
 * Standalone Node entrypoint. Starts pg-boss + registers every worker.
 * Run via `pnpm jobs:start`. Decoupled from the Next.js server lifecycle so
 * webhook processing keeps running through web restarts.
 */
async function main(): Promise<void> {
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
