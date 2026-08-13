import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type SubscriptionActivatedData = {
  ownerName: string
  tenantName: string
  planName: string
  periodEnd: string // "15/05/2026"
}

export function renderSubscriptionActivated(data: SubscriptionActivatedData): EmailContent {
  const subject = `Suscripción activada — ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#16a34a">Tu suscripción está activa</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>Activamos tu suscripción de <strong>${escapeHtml(data.tenantName)}</strong> al plan <strong>${escapeHtml(data.planName)}</strong>.</p>
  <p>Próxima renovación: <strong>${data.periodEnd}</strong>.</p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Tu suscripción está activa\n\nHola ${data.ownerName},\n\nActivamos tu suscripción de ${data.tenantName} al plan ${data.planName}.\n\nPróxima renovación: ${data.periodEnd}.\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
