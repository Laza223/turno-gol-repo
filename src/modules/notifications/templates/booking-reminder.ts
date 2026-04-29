import type { EmailContent } from './index'

export type BookingReminderData = {
  playerFirstName: string
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
  tenantName: string
  tenantAddress: string
}

export function renderBookingReminder(data: BookingReminderData): EmailContent {
  const subject = `Recordatorio: tu turno es mañana — ${data.courtName} ${data.timeStart}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0369a1">Tu turno es mañana 🏟</h2>
  <p>Hola ${data.playerFirstName},</p>
  <p>Te recordamos que tenés un turno reservado para mañana:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Complejo</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.tenantName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.courtName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Horario</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.timeStart} – ${data.timeEnd}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Dirección</td><td style="padding:8px 0">${data.tenantAddress}</td></tr>
  </table>
  <p style="color:#64748b;font-size:14px">Si necesitás cancelar, recordá hacerlo con al menos 12 horas de anticipación.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Tu turno es mañana\n\nHola ${data.playerFirstName},\n\nComplejo: ${data.tenantName}\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart} – ${data.timeEnd}\nDirección: ${data.tenantAddress}\n\n— TurnoGol`
  return { subject, html, text }
}
