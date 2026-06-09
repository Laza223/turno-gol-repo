import type { EmailContent } from './index'

export type DepositExpiredData = {
  playerFirstName: string
  courtName: string
  date: string
  timeStart: string
  tenantName: string
}

export function renderDepositExpired(data: DepositExpiredData): EmailContent {
  const subject = `Tu reserva expiró — ${data.courtName}, ${data.date} ${data.timeStart}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Tu reserva expiró</h2>
  <p>Hola ${data.playerFirstName},</p>
  <p>Tu reserva en <strong>${data.tenantName}</strong> expiró porque no se recibió la seña a tiempo.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.courtName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Horario</td><td style="padding:8px 0">${data.timeStart}</td></tr>
  </table>
  <p>Si todavía querés reservar, podés intentarlo de nuevo desde la app.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Tu reserva expiró\n\nHola ${data.playerFirstName},\n\nTu reserva en ${data.tenantName} expiró por falta de pago de la seña.\n\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart}\n\n— TurnoGol`
  return { subject, html, text }
}
