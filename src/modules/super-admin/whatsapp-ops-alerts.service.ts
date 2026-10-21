import { eq } from 'drizzle-orm'
import type { Db } from '@/shared/db/client'
import { opsAlerts, systemAdmins } from '@/shared/db/schema'
import { captureException } from '@/lib/sentry'
import { logger } from '@/shared/lib/logger'
import { artDateOf } from '@/shared/time/art-date'
import { getEmailProvider } from '@/modules/notifications/email.provider'
import { appLink } from '@/modules/notifications/templates/app-link'
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
 * Dedupe con `ops_alerts` (migr. 097): se reclama la clave ANTES de mandar y,
 * si el envío falla, se libera para que el próximo tick reintente.
 */

const KAPSO_WARN_RATIO = 0.8
/** Un entrante sin procesar de hace más que esto ya es una cola trabada, no un turno lento. */
const BACKLOG_ALERT_MINUTES = 5

type OpsAlert = { key: string; subject: string; lines: string[] }

type OpsSnapshot = { now: Date; monthTotal: number; backlog: number; botErrorPaused: number }

/** 'YYYY-MM-DDTHH' en hora argentina (UTC-3 fijo, sin DST). */
function artHourKey(now: Date): string {
  const artHour = (now.getUTCHours() + 21) % 24
  return `${artDateOf(now)}T${String(artHour).padStart(2, '0')}`
}

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

function render(alert: OpsAlert): { html: string; text: string } {
  const link = appLink('/super-admin/whatsapp')
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#d97706">${alert.subject}</h2>
  ${alert.lines.map((l) => `<p>${l}</p>`).join('\n  ')}
  <p><a href="${link}">Abrir el monitor del bot</a></p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `${alert.subject}\n\n${alert.lines.join('\n')}\n\nMonitor: ${link}\n\n— TurnoGol`
  return { html, text }
}

async function activeAdminEmails(db: Db): Promise<string[]> {
  const rows = await db
    .select({ email: systemAdmins.email })
    .from(systemAdmins)
    .where(eq(systemAdmins.status, 'active'))
  return rows.map((r) => r.email)
}

/** Un tick del cron. `db` es el pool worker: tablas cross-tenant y `ops_alerts` deny-all. */
export async function runWhatsappOpsAlerts(db: Db, now: Date = new Date()): Promise<void> {
  const [monthTotal, backlog, botErrorPaused] = await Promise.all([
    getMonthMessageTotal(db, now),
    countInboundBacklog(db, BACKLOG_ALERT_MINUTES),
    countBotErrorPaused(db),
  ])
  const alerts = pickOpsAlerts({ now, monthTotal, backlog, botErrorPaused })
  if (alerts.length === 0) return

  // 100% y 80% en el mismo tick ya se resolvieron en `pickOpsAlerts`: un solo mail.
  const recipients = await activeAdminEmails(db)
  if (recipients.length === 0) {
    logger.warn('whatsapp-ops-alerts: hay alertas pero no hay super admins activos', {
      module: 'super-admin',
      alerts: alerts.map((a) => a.key),
    })
    return
  }

  for (const alert of alerts) {
    const claimed = await db
      .insert(opsAlerts)
      .values({ key: alert.key })
      .onConflictDoNothing()
      .returning({ key: opsAlerts.key })
    if (claimed.length === 0) continue

    const { html, text } = render(alert)
    // `async`: sin RESEND_API_KEY el constructor de Resend tira síncrono; así cae
    // como rechazo y la clave se libera en vez de quedar reclamada sin mail.
    const results = await Promise.allSettled(
      recipients.map(async (to) =>
        getEmailProvider().send({ to, subject: alert.subject, html, text }),
      ),
    )
    for (const r of results) {
      if (r.status === 'rejected') captureException(r.reason)
    }
    // Si no le llegó a nadie, se libera la clave para reintentar en el próximo tick.
    if (results.every((r) => r.status === 'rejected')) {
      await db.delete(opsAlerts).where(eq(opsAlerts.key, alert.key))
      logger.error('whatsapp-ops-alerts: no se pudo enviar, se reintenta en el próximo tick', {
        module: 'super-admin',
        key: alert.key,
      })
    }
  }
}
