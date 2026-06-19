import type { EmailContent } from './index'

export type NoShowDebtCreatedData = {
  playerFirstName: string
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
  tenantName: string
  debtAmount: string // monto formateado, ej. "$15.000"
  tenantAddress: string
}

export function renderNoShowDebtCreated(data: NoShowDebtCreatedData): EmailContent {
  const subject = `Tenés una deuda pendiente en ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Tenés una deuda pendiente</h2>
  <p>Hola ${data.playerFirstName},</p>
  <p>No te presentaste al turno reservado en <strong>${data.tenantName}</strong> y se generó una deuda a tu nombre.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.courtName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Horario</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.timeStart} – ${data.timeEnd}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Deuda</td><td style="padding:8px 0"><strong style="color:#dc2626">${data.debtAmount}</strong></td></tr>
  </table>
  <p>Mientras tengas esta deuda pendiente, <strong>no vas a poder reservar online</strong> en este complejo.</p>
  <p>Acercate al complejo para regularizar tu situación:</p>
  <p style="color:#64748b;font-size:14px"><strong>${data.tenantName}</strong> — ${data.tenantAddress}</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Tenés una deuda pendiente\n\nHola ${data.playerFirstName},\n\nNo te presentaste al turno reservado en ${data.tenantName} y se generó una deuda a tu nombre.\n\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart} – ${data.timeEnd}\nDeuda: ${data.debtAmount}\n\nMientras tengas esta deuda pendiente, no vas a poder reservar online en este complejo.\n\nAcercate al complejo para regularizar tu situación:\n${data.tenantName} — ${data.tenantAddress}\n\n— TurnoGol`
  return { subject, html, text }
}
