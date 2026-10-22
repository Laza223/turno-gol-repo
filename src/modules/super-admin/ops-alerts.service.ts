import { eq } from 'drizzle-orm'
import type { Db } from '@/shared/db/client'
import { opsAlerts, systemAdmins } from '@/shared/db/schema'
import { captureException } from '@/lib/sentry'
import { logger } from '@/shared/lib/logger'
import { artDateOf } from '@/shared/time/art-date'
import { getEmailProvider } from '@/modules/notifications/email.provider'
import { appLink } from '@/modules/notifications/templates/app-link'
import { escapeHtml } from '@/modules/notifications/templates/html-escape'

/**
 * Canal de alertas de ops: mail a los super admins activos.
 *
 * Dedupe con `ops_alerts` (migr. 097): se reclama la clave ANTES de mandar y,
 * si el envío no le llega a nadie, se libera para que el próximo tick reintente.
 * La clave la arma el que alerta; tiene que ser determinística.
 */

export type OpsAlert = { key: string; subject: string; lines: string[] }

/** A qué pantalla del panel lleva el mail. `path` es relativo, ej. '/super-admin/whatsapp'. */
export type OpsAlertLink = { path: string; label: string }

/** 'YYYY-MM-DDTHH' en hora argentina (UTC-3 fijo, sin DST). Para claves de una alerta por hora. */
export function artHourKey(now: Date): string {
  const artHour = (now.getUTCHours() + 21) % 24
  return `${artDateOf(now)}T${String(artHour).padStart(2, '0')}`
}

/** El asunto y las líneas pueden traer datos del complejo (su nombre): van escapados al HTML. */
function render(alert: OpsAlert, link: OpsAlertLink): { html: string; text: string } {
  const url = appLink(link.path)
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#d97706">${escapeHtml(alert.subject)}</h2>
  ${alert.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n  ')}
  <p><a href="${url}">${link.label}</a></p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `${alert.subject}\n\n${alert.lines.join('\n')}\n\n${link.label}: ${url}\n\n— TurnoGol`
  return { html, text }
}

async function activeAdminEmails(db: Db): Promise<string[]> {
  const rows = await db
    .select({ email: systemAdmins.email })
    .from(systemAdmins)
    .where(eq(systemAdmins.status, 'active'))
  return rows.map((r) => r.email)
}

/**
 * `db` es el pool worker: `system_admins` es del sistema y `ops_alerts` es deny-all para la app.
 *
 * Devuelve las claves que no le llegaron a nadie (todas, si no hay super admins
 * activos). Una clave que ya había reclamado otro envío cuenta como entregada.
 */
export async function sendOpsAlerts(
  db: Db,
  alerts: readonly OpsAlert[],
  link: OpsAlertLink,
): Promise<string[]> {
  if (alerts.length === 0) return []

  const recipients = await activeAdminEmails(db)
  if (recipients.length === 0) {
    logger.warn('ops-alerts: hay alertas pero no hay super admins activos', {
      module: 'super-admin',
      alerts: alerts.map((a) => a.key),
    })
    return alerts.map((a) => a.key)
  }

  const undelivered: string[] = []
  for (const alert of alerts) {
    const claimed = await db
      .insert(opsAlerts)
      .values({ key: alert.key })
      .onConflictDoNothing()
      .returning({ key: opsAlerts.key })
    if (claimed.length === 0) continue

    const { html, text } = render(alert, link)
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
      undelivered.push(alert.key)
      logger.error('ops-alerts: no se pudo enviar, se reintenta en el próximo tick', {
        module: 'super-admin',
        key: alert.key,
      })
    }
  }
  return undelivered
}
