import type PgBoss from 'pg-boss'
import { processRivalMailJob } from '@/modules/rival/rival-mail.service'
import { logger } from '@/shared/lib/logger'
import { QUEUE_RIVAL_MAIL, type RivalMailJobData } from '../definitions'

/**
 * Consumidor de los mails de RIVAL. Cascarón: la revalidación contra la base, el dedupe y la
 * inserción de la notificación viven en `rival-mail.service.ts`. El job lo encola el service de
 * RIVAL post-commit, diferido a las 08:00 ART si cae en la ventana silenciosa.
 */
export async function registerRivalMailWorker(boss: PgBoss): Promise<void> {
  await boss.work<RivalMailJobData>(QUEUE_RIVAL_MAIL, async (job) => {
    const j = Array.isArray(job) ? job[0] : job
    if (!j?.data) return
    await processRivalMailJob(j.data)
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_RIVAL_MAIL })
}
