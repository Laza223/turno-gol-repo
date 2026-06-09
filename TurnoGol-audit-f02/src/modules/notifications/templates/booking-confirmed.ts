import type { EmailContent } from './index'

export type BookingConfirmedData = {
  playerFirstName: string
  courtName: string
  date: string       // "02/06/2031"
  timeStart: string  // "10:00"
  timeEnd: string    // "11:00"
  tenantName: string
  tenantAddress: string
}

export function renderBookingConfirmed(data: BookingConfirmedData): EmailContent {
  const subject = `Reserva confirmada — ${data.courtName}, ${data.date} ${data.timeStart}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0369a1">¡Tu reserva está confirmada!</h2>
  <p>Hola ${data.playerFirstName},</p>
  <p>Tu reserva fue confirmada exitosamente. Acá tenés los detalles:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Complejo</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.tenantName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.courtName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Horario</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.timeStart} – ${data.timeEnd}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Dirección</td><td style="padding:8px 0">${data.tenantAddress}</td></tr>
  </table>
  <p style="color:#64748b;font-size:14px">Si necesitás cancelar tu reserva, podés hacerlo desde la app hasta 12 horas antes.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `¡Tu reserva está confirmada!\n\nHola ${data.playerFirstName},\n\nComplejo: ${data.tenantName}\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart} – ${data.timeEnd}\nDirección: ${data.tenantAddress}\n\n— TurnoGol`
  return { subject, html, text }
}
