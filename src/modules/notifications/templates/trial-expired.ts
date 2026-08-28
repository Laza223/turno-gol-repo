import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type TrialExpiredData = {
  ownerName: string
  tenantName: string
}

/**
 * Día 31: el trial venció y `runExpireTrials` acaba de bloquear el tenant
 * (doc7 Flujo 7, cronograma). No promete un plazo de retención de datos: esa
 * transición no fija `scheduled_deletion_at` (a diferencia de
 * `canceled→blocked` / `blocked→churned`), así que decir "tus datos se
 * guardan N días" acá sería una promesa que el sistema no cumple.
 */
export function renderTrialExpired(data: TrialExpiredData): EmailContent {
  const subject = `Tu prueba gratuita terminó — ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Tu prueba gratuita terminó</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>El período de prueba de <strong>${escapeHtml(data.tenantName)}</strong> en TurnoGol terminó. Suscribite para seguir usando TurnoGol.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="https://app.turnogol.app/settings/facturacion" style="background:#0369a1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Suscribirme →</a>
  </p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Tu prueba gratuita terminó\n\nHola ${data.ownerName},\n\nEl período de prueba de ${data.tenantName} en TurnoGol terminó. Suscribite para seguir usando TurnoGol: https://app.turnogol.app/settings/facturacion\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
