import type { EmailContent } from './index'

export type SubscriptionRenewedData = {
  ownerName: string
  tenantName: string
  planName: string
  periodEnd: string
}

export function renderSubscriptionRenewed(data: SubscriptionRenewedData): EmailContent {
  const subject = `Suscripción renovada — ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0369a1">Renovamos tu suscripción</h2>
  <p>Hola ${data.ownerName},</p>
  <p>Cobramos la cuota de <strong>${data.tenantName}</strong> (plan ${data.planName}) sin problemas.</p>
  <p>Próxima renovación: <strong>${data.periodEnd}</strong>.</p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Renovamos tu suscripción\n\nHola ${data.ownerName},\n\nCobramos la cuota de ${data.tenantName} (plan ${data.planName}) sin problemas.\n\nPróxima renovación: ${data.periodEnd}.\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
