import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type TrialEndingData = {
  ownerName: string
  tenantName: string
  daysLeft: number
}

export function renderTrialEnding(data: TrialEndingData): EmailContent {
  const subject = `Tu prueba gratuita vence en ${data.daysLeft} día${data.daysLeft === 1 ? '' : 's'} — TurnoGol`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#d97706">Tu prueba gratuita está por vencer</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>Tu período de prueba de <strong>${escapeHtml(data.tenantName)}</strong> en TurnoGol vence en <strong>${data.daysLeft} día${data.daysLeft === 1 ? '' : 's'}</strong>.</p>
  <p>Para seguir usando TurnoGol sin interrupciones, activá tu suscripción desde el panel:</p>
  <p style="text-align:center;margin:24px 0">
    <a href="https://app.turnogol.app/settings/facturacion" style="background:#0369a1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Activar suscripción →</a>
  </p>
  <p style="color:#64748b;font-size:14px">Si ya activaste tu suscripción, ignorá este mensaje.</p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Tu prueba gratuita está por vencer\n\nHola ${data.ownerName},\n\nTu período de prueba de ${data.tenantName} vence en ${data.daysLeft} día${data.daysLeft === 1 ? '' : 's'}.\n\nActivá tu suscripción en: https://app.turnogol.app/settings/facturacion\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
