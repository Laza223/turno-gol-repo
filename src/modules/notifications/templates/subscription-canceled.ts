import type { EmailContent } from './index'

export type SubscriptionCanceledData = {
  ownerName: string
  tenantName: string
  accessUntil: string // "15/05/2026"
}

export function renderSubscriptionCanceled(data: SubscriptionCanceledData): EmailContent {
  const subject = `Cancelaste tu suscripción — ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#475569">Suscripción cancelada</h2>
  <p>Hola ${data.ownerName},</p>
  <p>Cancelamos la suscripción de <strong>${data.tenantName}</strong>.</p>
  <p>Tu acceso completo continúa hasta <strong>${data.accessUntil}</strong>. Después tu cuenta entra en modo restringido y los datos quedan disponibles 60 días para reactivar.</p>
  <p style="color:#64748b;font-size:14px">¿Cambiaste de idea? Reactivá desde el panel.</p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Suscripción cancelada\n\nHola ${data.ownerName},\n\nCancelamos la suscripción de ${data.tenantName}.\n\nTu acceso completo continúa hasta ${data.accessUntil}. Después la cuenta entra en modo restringido (60 días para reactivar).\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
