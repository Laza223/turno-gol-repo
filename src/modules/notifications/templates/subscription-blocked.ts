import type { EmailContent } from './index'

export type SubscriptionBlockedData = {
  ownerName: string
  tenantName: string
}

export function renderSubscriptionBlocked(
  data: SubscriptionBlockedData,
): EmailContent {
  const subject = `Cuenta bloqueada — ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Cuenta bloqueada</h2>
  <p>Hola ${data.ownerName},</p>
  <p>Bloqueamos el acceso a <strong>${data.tenantName}</strong> tras 14 días sin regularizar el pago.</p>
  <p>Tus datos siguen guardados. Podés reactivar la suscripción en cualquier momento dentro de los próximos 90 días.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="https://turnogol.com.ar/settings/facturacion" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reactivar cuenta →</a>
  </p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Cuenta bloqueada\n\nHola ${data.ownerName},\n\nBloqueamos el acceso a ${data.tenantName}. Reactivá en los próximos 90 días: https://turnogol.com.ar/settings/facturacion\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
