import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'
import {
  tenantContactHtml,
  tenantContactText,
  type TenantContactFields,
} from './tenant-contact-block'

export type BookingCanceledData = TenantContactFields & {
  playerFirstName: string
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
  canceledBy: 'player' | 'admin' | 'system'
  /** Código corto de la reserva, para que el complejo la encuentre. */
  bookingCode: string
  reason?: string
}

export function renderBookingCanceled(data: BookingCanceledData): EmailContent {
  const subject = `Reserva cancelada — ${data.courtName}, ${data.date} ${data.timeStart}`
  const reasonLine = data.reason ? `<p><strong>Motivo:</strong> ${escapeHtml(data.reason)}</p>` : ''
  const contactIntro = '¿Tenés que coordinar la devolución de la seña? Escribile al complejo:'
  const waMessage =
    `Hola ${data.tenantName}, cancelé mi reserva ${data.bookingCode} del ${data.date} ` +
    `a las ${data.timeStart}. Quería coordinar la devolución de la seña. ¡Gracias!`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Reserva cancelada</h2>
  <p>Hola ${escapeHtml(data.playerFirstName)},</p>
  <p>Tu reserva en <strong>${escapeHtml(data.tenantName)}</strong> fue cancelada.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(data.courtName)}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Horario</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.timeStart} – ${data.timeEnd}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Código</td><td style="padding:8px 0"><strong>${escapeHtml(data.bookingCode)}</strong></td></tr>
  </table>
  ${reasonLine}
  ${tenantContactHtml(data, contactIntro, waMessage)}
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Reserva cancelada\n\nHola ${data.playerFirstName},\n\nTu reserva en ${data.tenantName} fue cancelada.\n\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart} – ${data.timeEnd}\nCódigo: ${data.bookingCode}${data.reason ? `\nMotivo: ${data.reason}` : ''}\n\n${tenantContactText(data, contactIntro)}\n\n— TurnoGol`
  return { subject, html, text }
}
