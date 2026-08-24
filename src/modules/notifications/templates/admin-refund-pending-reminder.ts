import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type AdminRefundPendingReminderData = {
  refundPaymentId: string
  bookingId: string | null
  /** Monto ya formateado en ARS, ej. "3.000,00". */
  amountArs: string
  /** Días que lleva pendiente, para que el mail diga desde cuándo espera. */
  daysPending: number
  playerName?: string
  courtName?: string
  date?: string
}

/**
 * Recordatorio al complejo: una devolución de seña lleva más de una semana sin
 * saldarse.
 *
 * Distinto de `admin_refund_failed`, que es específico de MercadoPago y sale a
 * las 24h: este cubre CUALQUIER medio, incluidas las señas cobradas en efectivo
 * o por transferencia, que no tienen ningún camino automático que las resuelva.
 * Sin esto, esas devoluciones no tenían ninguna alerta.
 *
 * Al jugador no se le manda nada (decisión del dueño): un mail nuestro
 * diciéndole que su complejo no le pagó nos pondría de árbitro en un conflicto
 * de plata entre dos partes, contra nuestro propio cliente. El jugador ya tiene
 * el recordatorio permanente en su reserva y el botón para escribir.
 */
export function renderAdminRefundPendingReminder(
  data: AdminRefundPendingReminderData,
): EmailContent {
  const refundRef = data.refundPaymentId.slice(0, 8)
  const who = data.playerName ? ` a ${data.playerName}` : ''
  const subject = `Devolución pendiente hace ${data.daysPending} días — $${data.amountArs}`
  const detailRows = [
    data.playerName
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Jugador</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(data.playerName)}</td></tr>`
      : '',
    data.courtName
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(data.courtName)}</td></tr>`
      : '',
    data.date
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha del turno</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>`
      : '',
  ].join('')
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#b45309">Tenés una devolución sin hacer</h2>
  <p>Hace <strong>${data.daysPending} días</strong> que le debés <strong>$${data.amountArs}</strong>${escapeHtml(who)} por una seña de un turno cancelado.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    ${detailRows}
    <tr><td style="padding:8px 0;font-weight:600;width:40%">Devolución</td><td style="padding:8px 0">#${refundRef}</td></tr>
  </table>
  <p>Devolvésela por donde te quede más cómodo — MercadoPago, transferencia o efectivo — y después marcala en <strong>Caja y Cantina → Devoluciones</strong>. Si la devolvés desde el panel de MercadoPago, se marca sola.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Tenés una devolución sin hacer\n\nHace ${data.daysPending} días que le debés $${data.amountArs}${who} por una seña de un turno cancelado.${data.playerName ? `\n\nJugador: ${data.playerName}` : ''}${data.courtName ? `\nCancha: ${data.courtName}` : ''}${data.date ? `\nFecha del turno: ${data.date}` : ''}\nDevolución: #${refundRef}\n\nDevolvésela por donde te quede más cómodo — MercadoPago, transferencia o efectivo — y después marcala en Caja y Cantina → Devoluciones. Si la devolvés desde el panel de MercadoPago, se marca sola.\n\n— TurnoGol`
  return { subject, html, text }
}
