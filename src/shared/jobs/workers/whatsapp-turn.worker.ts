import type PgBoss from 'pg-boss'
import { sql } from 'drizzle-orm'
import { getWorkerDb } from '@/shared/db/client'
import {
  CRON_WORK_OPTIONS,
  QUEUE_WHATSAPP_OPS_ALERTS,
  QUEUE_WHATSAPP_TURN,
  QUEUE_WHATSAPP_TURN_RESCUE,
  type WhatsappTurnJobData,
} from '../definitions'
import { processWhatsappTurn } from '@/modules/whatsapp-bot/whatsapp-bot.turn'
import { enqueueWhatsappTurns } from '@/modules/whatsapp-bot/whatsapp-bot.queue'
import { runWhatsappOpsAlerts } from '@/modules/super-admin/whatsapp-ops-alerts.service'
import { captureMessage } from '@/lib/sentry'
import { logger } from '@/shared/lib/logger'

/**
 * Turnos del bot de WhatsApp.
 *
 * - `whatsapp-turn`: un job por chat (cola singleton, ver `whatsappTurnSendOptions`).
 *   `teamSize`/`teamConcurrency` > 1: cada turno espera al modelo varios
 *   segundos y los chats de todos los complejos no pueden quedar en fila de a
 *   uno. `enforceSingletonQueueActiveLimit` impide que corran dos del MISMO chat.
 * - `whatsapp-turn-rescue`: cada minuto busca entrantes sin procesar de hace
 *   más de 30 s (un envío a la cola que falló, un worker que murió en el
 *   medio) y les vuelve a encolar el turno. Sin esto, el jugador queda sin
 *   respuesta hasta que escriba de nuevo.
 */

const RESCUE_AFTER_SECONDS = 30
/** Más viejo que esto ya no vale contestar: la ventana de WhatsApp es de 24 h. */
const RESCUE_MAX_AGE_HOURS = 6

async function findStalledWhatsappChats(): Promise<WhatsappTurnJobData[]> {
  // Barrido cross-tenant: pool worker (BYPASSRLS), como todo sweep.
  const rows = (await getWorkerDb().execute(sql`
    SELECT DISTINCT tenant_id AS "tenantId", chat_id AS "chatId"
    FROM whatsapp_messages
    WHERE direction = 'inbound'
      AND processed_at IS NULL
      AND created_at < now() - make_interval(secs => ${RESCUE_AFTER_SECONDS})
      AND created_at > now() - make_interval(hours => ${RESCUE_MAX_AGE_HOURS})
    LIMIT 200
  `)) as unknown as WhatsappTurnJobData[]
  return rows
}

/** Sin el modelo o sin Kapso el turno podría reservar y no poder avisarlo. */
const REQUIRED_KEYS = ['ANTHROPIC_API_KEY', 'KAPSO_API_KEY'] as const

export async function registerWhatsappTurnWorker(boss: PgBoss): Promise<void> {
  const missingKeys = REQUIRED_KEYS.filter((key) => !process.env[key])
  if (missingKeys.length > 0) {
    // Los entrantes quedan sin procesar y el rescate los retoma cuando el
    // worker vuelva a arrancar con las claves (hasta 6 h): el dueño los ve
    // igual en su app.
    captureMessage('whatsapp-turn: faltan claves, el bot no contesta', 'error')
    logger.error('whatsapp-turn: faltan claves, el bot no contesta', {
      module: 'whatsapp-bot',
      missingKeys,
    })
  }

  await boss.work<WhatsappTurnJobData>(
    QUEUE_WHATSAPP_TURN,
    // `teamRefill`: sin esto pg-boss espera a que termine el lote ENTERO antes
    // de buscar más, y un turno lento retiene las otras plazas.
    { teamSize: 4, teamConcurrency: 4, teamRefill: true, enforceSingletonQueueActiveLimit: true },
    async (job) => {
      if (missingKeys.length > 0) return
      const data = (Array.isArray(job) ? job[0]?.data : job.data) as WhatsappTurnJobData
      const outcome = await processWhatsappTurn(data)
      logger.info('whatsapp-turn: turno procesado', {
        module: 'whatsapp-bot',
        tenantId: data.tenantId,
        outcome,
      })
    },
  )
  logger.info('registered queue', { module: 'workers', queue: QUEUE_WHATSAPP_TURN })

  await boss.schedule(QUEUE_WHATSAPP_TURN_RESCUE, '* * * * *', {})
  await boss.work(QUEUE_WHATSAPP_TURN_RESCUE, CRON_WORK_OPTIONS, async () => {
    const stalled = await findStalledWhatsappChats()
    if (stalled.length === 0) return
    logger.warn('whatsapp-turn: chats sin respuesta, se reencolan', {
      module: 'whatsapp-bot',
      count: stalled.length,
    })
    await enqueueWhatsappTurns(stalled)
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_WHATSAPP_TURN_RESCUE })

  // Mail al dueño cuando el consumo del mes se acerca al límite o el bot se
  // rompe. Dedupe por clave en `ops_alerts`; ver whatsapp-ops-alerts.service.ts.
  await boss.schedule(QUEUE_WHATSAPP_OPS_ALERTS, '*/5 * * * *', {})
  await boss.work(QUEUE_WHATSAPP_OPS_ALERTS, CRON_WORK_OPTIONS, async () => {
    await runWhatsappOpsAlerts(getWorkerDb())
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_WHATSAPP_OPS_ALERTS })
}
