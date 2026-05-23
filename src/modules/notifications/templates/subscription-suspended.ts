import type { EmailContent } from './index'

export type SubscriptionSuspendedData = {
  ownerName: string
  tenantName: string
}

export function renderSubscriptionSuspended(
  data: SubscriptionSuspendedData,
): EmailContent {
  const subject = `Cuenta suspendida — ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#d97706">Tu cuenta está suspendida</h2>
  <p>Hola ${data.ownerName},</p>
  <p>No pudimos cobrar la suscripción de <strong>${data.tenantName}</strong> después de varios reintentos. Pasamos tu cuenta a modo solo lectura.</p>
  <p>Los jugadores siguen viendo sus reservas, pero no podés gestionar el complejo hasta regularizar el pago.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="https://turnogol.com.ar/settings/facturacion" style="background:#d97706;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Regularizar pago →</a>
  </p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Tu cuenta está suspendida\n\nHola ${data.ownerName},\n\nNo pudimos cobrar la suscripción de ${data.tenantName}. Tu cuenta está en modo solo lectura.\n\nRegularizá el pago en: https://turnogol.com.ar/settings/facturacion\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
