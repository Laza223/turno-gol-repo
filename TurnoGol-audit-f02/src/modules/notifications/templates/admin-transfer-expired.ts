import type { EmailContent } from './index'

export type AdminTransferExpiredData = {
  courtName: string
  date: string
  timeStart: string
  bookingId: string
}

/**
 * Admin alert (Hallazgo 2): a booking whose deposit was being paid by bank
 * transfer (MP `in_process`) never settled within 48h. The slot was freed.
 */
export function renderAdminTransferExpired(data: AdminTransferExpiredData): EmailContent {
  const subject = `Transferencia no acreditada — turno liberado (${data.courtName}, ${data.date})`
  const ref = data.bookingId.slice(0, 8)
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#d97706">Transferencia no acreditada a tiempo</h2>
  <p>Una reserva con seña por transferencia bancaria estuvo <strong>48 horas en proceso</strong> sin acreditarse. El turno fue liberado automáticamente.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.courtName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Horario</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.timeStart}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Reserva</td><td style="padding:8px 0">#${ref}</td></tr>
  </table>
  <p>Si la transferencia se acredita más tarde, vas a recibir un aviso de <strong>pago tardío</strong> y deberás resolver el reembolso con el jugador.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Transferencia no acreditada a tiempo\n\nUna reserva con seña por transferencia estuvo 48h en proceso sin acreditarse. El turno fue liberado.\n\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart}\nReserva: #${ref}\n\nSi la transferencia se acredita más tarde, recibirás un aviso de pago tardío.\n\n— TurnoGol`
  return { subject, html, text }
}
