import type { EmailContent } from './index'

export type DunningPaymentFailedData = {
  ownerName: string
  tenantName: string
  retryDate: string // "15/06/2026"
}

export function renderDunningPaymentFailed(data: DunningPaymentFailedData): EmailContent {
  const subject = `Problema con tu pago de TurnoGol — ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">No pudimos procesar tu pago</h2>
  <p>Hola ${data.ownerName},</p>
  <p>Hubo un problema al cobrar la suscripción de <strong>${data.tenantName}</strong> en TurnoGol.</p>
  <p>Vamos a reintentar el cobro el <strong>${data.retryDate}</strong>. Si para esa fecha el pago sigue fallando, tu cuenta pasará a modo restringido.</p>
  <p>Para evitar interrupciones, actualizá tu método de pago en MercadoPago:</p>
  <p style="text-align:center;margin:24px 0">
    <a href="https://app.turnogol.app/settings/facturacion" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Actualizar método de pago →</a>
  </p>
  <p style="color:#64748b;font-size:14px">Si ya solucionaste el problema, ignorá este mensaje.</p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Problema con tu pago de TurnoGol\n\nHola ${data.ownerName},\n\nHubo un problema al cobrar la suscripción de ${data.tenantName}.\n\nVamos a reintentar el ${data.retryDate}. Actualizá tu método de pago en: https://app.turnogol.app/settings/facturacion\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
