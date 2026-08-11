import type { EmailContent } from './index'

export type BookingCanceledByComplexData = {
  playerFirstName: string
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
  tenantName: string
  refundConfirmed: boolean
}

export function renderBookingCanceledByComplex(data: BookingCanceledByComplexData): EmailContent {
  const subject = `Tu turno en ${data.tenantName} fue cancelado`
  const refundLine = data.refundConfirmed
    ? '<p style="color:#16a34a"><strong>Reembolso confirmado:</strong> te devolvemos la seña de forma automática.</p>'
    : ''
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Tu turno fue cancelado</h2>
  <p>Hola ${data.playerFirstName},</p>
  <p>El complejo <strong>${data.tenantName}</strong> canceló tu turno.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.courtName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Horario</td><td style="padding:8px 0">${data.timeStart} – ${data.timeEnd}</td></tr>
  </table>
  ${refundLine}
  <p style="color:#64748b;font-size:14px">Si tenés dudas, contactá directamente al complejo.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Tu turno fue cancelado\n\nHola ${data.playerFirstName},\n\nEl complejo ${data.tenantName} canceló tu turno.\n\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart} – ${data.timeEnd}${data.refundConfirmed ? '\n\nReembolso confirmado: te devolvemos la seña de forma automática.' : ''}\n\n— TurnoGol`
  return { subject, html, text }
}
