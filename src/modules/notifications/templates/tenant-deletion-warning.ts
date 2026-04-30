import type { EmailContent } from './index'

export type TenantDeletionWarningData = {
  ownerName: string
  tenantName: string
  deletionDate: string // "15/05/2026"
  daysRemaining: number
}

export function renderTenantDeletionWarning(
  data: TenantDeletionWarningData,
): EmailContent {
  const subject = `Eliminación programada — ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Tus datos se eliminan en ${data.daysRemaining} días</h2>
  <p>Hola ${data.ownerName},</p>
  <p>Tu cuenta <strong>${data.tenantName}</strong> está marcada para eliminación definitiva el <strong>${data.deletionDate}</strong>.</p>
  <p>Esta acción es irreversible: borraremos reservas, pagos, jugadores y configuración (Ley 25.326).</p>
  <p>Si querés conservar tus datos, reactivá la suscripción antes de esa fecha:</p>
  <p style="text-align:center;margin:24px 0">
    <a href="https://turnogol.com.ar/configuracion/facturacion" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reactivar cuenta →</a>
  </p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Tus datos se eliminan en ${data.daysRemaining} días\n\nHola ${data.ownerName},\n\nTu cuenta ${data.tenantName} se elimina el ${data.deletionDate}. Reactivá antes en: https://turnogol.com.ar/configuracion/facturacion\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
