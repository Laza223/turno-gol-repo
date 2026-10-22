import type { Db } from '@/shared/db/client'
import { artDateOf } from '@/shared/time/art-date'
import { artHourKey, sendOpsAlerts, type OpsAlert } from './ops-alerts.service'
import {
  countBotErrorPaused,
  countInboundBacklog,
  getMonthMessageTotal,
  KAPSO_PLAN_MONTHLY_MESSAGES,
} from './whatsapp-monitor.service'

/**
 * Alertas por mail al dueño sobre el bot de WhatsApp (cron `whatsapp-ops-alerts`,
 * cada 5 min). Sin datos personales: solo conteos.
 *
 * El envío y el dedupe por clave (`ops_alerts`, migr. 097) son del canal de ops:
 * `ops-alerts.service.ts`.
 */

const KAPSO_WARN_RATIO = 0.8
/** Un entrante sin procesar de hace más que esto ya es una cola trabada, no un turno lento. */
const BACKLOG_ALERT_MINUTES = 5

type OpsSnapshot = { now: Date; monthTotal: number; backlog: number; botErrorPaused: number }

/** Qué alertas corresponden a esta foto. Pura: el dedupe y el envío van aparte. */
export function pickOpsAlerts(s: OpsSnapshot): OpsAlert[] {
  const alerts: OpsAlert[] = []
  const month = artDateOf(s.now).slice(0, 7)
  const limit = KAPSO_PLAN_MONTHLY_MESSAGES

  if (s.monthTotal >= limit) {
    alerts.push({
      key: `kapso-100:${month}`,
      subject: 'Bot de WhatsApp: se alcanzó el límite de mensajes del mes',
      lines: [
        `Este mes ya van ${s.monthTotal} mensajes y el plan de Kapso incluye ${limit}.`,
        'A partir de acá el bot puede dejar de enviar o recibir mensajes. Conviene pasar al plan Pro.',
      ],
    })
  } else if (s.monthTotal >= limit * KAPSO_WARN_RATIO) {
    alerts.push({
      key: `kapso-80:${month}`,
      subject: 'Bot de WhatsApp: llegó al 80% de los mensajes del mes',
      lines: [
        `Este mes ya van ${s.monthTotal} de ${limit} mensajes del plan de Kapso.`,
        'El conteo es aproximado (sale de nuestros registros, Kapso no lo informa).',
      ],
    })
  }

  if (s.backlog > 0) {
    alerts.push({
      key: `backlog:${artHourKey(s.now)}`,
      subject: 'Bot de WhatsApp: hay mensajes sin contestar',
      lines: [
        `Hay ${s.backlog} mensajes de jugadores sin procesar hace más de ${BACKLOG_ALERT_MINUTES} minutos.`,
        'Puede ser que el worker esté caído o que falte una clave del bot.',
      ],
    })
  }

  if (s.botErrorPaused > 0) {
    alerts.push({
      key: `bot-error:${artHourKey(s.now)}`,
      subject: 'Bot de WhatsApp: el bot falló y pausó conversaciones',
      lines: [
        `Hay ${s.botErrorPaused} conversaciones pausadas porque el bot tuvo un error.`,
        'Mientras estén pausadas, las atiende una persona del complejo.',
      ],
    })
  }

  return alerts
}

/** Un tick del cron. `db` es el pool worker: tablas cross-tenant y `ops_alerts` deny-all. */
export async function runWhatsappOpsAlerts(db: Db, now: Date = new Date()): Promise<void> {
  const [monthTotal, backlog, botErrorPaused] = await Promise.all([
    getMonthMessageTotal(db, now),
    countInboundBacklog(db, BACKLOG_ALERT_MINUTES),
    countBotErrorPaused(db),
  ])
  // 100% y 80% en el mismo tick ya se resolvieron en `pickOpsAlerts`: un solo mail.
  const alerts = pickOpsAlerts({ now, monthTotal, backlog, botErrorPaused })
  await sendOpsAlerts(db, alerts, {
    path: '/super-admin/whatsapp',
    label: 'Abrir el monitor del bot',
  })
}
