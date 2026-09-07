import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type AdminLatePaymentData = {
  bookingId: string
  /** Pre-formatted ARS amount, e.g. "3.000,00". */
  amountArs: string
  /** Booking status at the time the payment arrived (e.g. 'expired'). */
  currentStatus: string
  courtName?: string
  date?: string
  /**
   * `true` cuando el pago tardío cayó sobre una reserva `expired`: TurnoGol
   * dejó REGISTRADA la devolución (una fila en `payments`, type `refund`,
   * status `pending`) y avisó al jugador que está en curso. NO significa que
   * la plata ya volvió: TurnoGol no reembolsa por API (el scope
   * `payments:refunds` de MercadoPago da 403 con cuentas de terceros, PR
   * #203/#212), así que la devuelve el complejo desde Caja y Cantina →
   * Devoluciones. El nombre se conserva pese a que ya no significa "se
   * resolvió solo" porque viaja en `notifications.content` de filas ya
   * encoladas; renombrarlo rompería su render (y tocaría payment.service.ts,
   * fuera de este alcance). Ausente/`false` = los otros estados terminales,
   * donde sigue haciendo falta que decida un humano.
   */
  refundIssued?: boolean
}

/**
 * Admin alert (Hallazgo 3): MercadoPago approved a payment AFTER the booking
 * had already left `pending_payment` (expired/canceled). The player paid but
 * has no slot — manual refund or reassignment is required.
 */
export function renderAdminLatePayment(data: AdminLatePaymentData): EmailContent {
  const ref = data.bookingId.slice(0, 8)
  const subject = data.refundIssued
    ? `⚠️ Pago tardío recibido — devolución pendiente (reserva #${ref})`
    : `⚠️ Pago tardío recibido — acción requerida (reserva #${ref})`
  const headline = 'Pago tardío recibido'
  const actionHtml = data.refundIssued
    ? '<p>El turno ya se había liberado, así que quedó <strong>registrada una devolución pendiente</strong> en Caja y Cantina → Devoluciones, y se le avisó al jugador que está en curso. <strong>La plata todavía no volvió</strong>: devolvésela vos por donde te quede más cómodo — MercadoPago, transferencia o efectivo — y después marcala en Caja y Cantina → Devoluciones. Si la devolvés desde el panel de MercadoPago, se marca sola.</p>'
    : '<p>El jugador pagó pero no tiene turno asignado. <strong>Se requiere acción manual</strong> para reembolsar o reasignar.</p>'
  const actionText = data.refundIssued
    ? 'El turno ya se había liberado, así que quedó registrada una devolución pendiente en Caja y Cantina → Devoluciones, y se le avisó al jugador que está en curso. La plata todavía no volvió: devolvésela vos por donde te quede más cómodo — MercadoPago, transferencia o efectivo — y después marcala en Caja y Cantina → Devoluciones. Si la devolvés desde el panel de MercadoPago, se marca sola.'
    : 'El jugador pagó pero no tiene turno. Se requiere acción manual para reembolsar o reasignar.'
  const detailRows = [
    data.courtName
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(data.courtName)}</td></tr>`
      : '',
    data.date
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>`
      : '',
  ].join('')
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">${headline}</h2>
  <p>Se recibió un pago de <strong>$${data.amountArs}</strong> para la reserva <strong>#${ref}</strong>, que ya estaba <strong>${data.currentStatus}</strong>.</p>
  ${actionHtml}
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    ${detailRows}
    <tr><td style="padding:8px 0;font-weight:600;width:40%">Reserva</td><td style="padding:8px 0">#${ref}</td></tr>
  </table>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `${headline}\n\nSe recibió un pago de $${data.amountArs} para la reserva #${ref}, que ya estaba ${data.currentStatus}.\n${actionText}${data.courtName ? `\n\nCancha: ${data.courtName}` : ''}${data.date ? `\nFecha: ${data.date}` : ''}\n\n— TurnoGol`
  return { subject, html, text }
}
