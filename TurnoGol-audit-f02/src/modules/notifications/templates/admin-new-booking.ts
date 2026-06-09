import type { EmailContent } from './index'

export type AdminNewBookingData = {
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
  playerName: string
  playerPhone?: string
}

export function renderAdminNewBooking(data: AdminNewBookingData): EmailContent {
  const subject = `Nueva reserva — ${data.courtName}, ${data.date} ${data.timeStart}`
  const phoneRow = data.playerPhone
    ? `<tr><td style="padding:8px 0;font-weight:600">Teléfono</td><td style="padding:8px 0">${data.playerPhone}</td></tr>`
    : ''
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0369a1">Nueva reserva online</h2>
  <p>Recibiste una nueva reserva online:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.courtName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Horario</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.timeStart} – ${data.timeEnd}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Jugador</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.playerName}</td></tr>
    ${phoneRow}
  </table>
  <p style="color:#64748b;font-size:14px">Podés ver los detalles completos en el panel de TurnoGol.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Nueva reserva online\n\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart} – ${data.timeEnd}\nJugador: ${data.playerName}${data.playerPhone ? `\nTeléfono: ${data.playerPhone}` : ''}\n\n— TurnoGol`
  return { subject, html, text }
}
