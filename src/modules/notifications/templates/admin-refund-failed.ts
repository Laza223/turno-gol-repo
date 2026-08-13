import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type AdminRefundFailedData = {
  refundPaymentId: string
  bookingId: string | null
  /** Pre-formatted ARS amount, e.g. "3.000,00". */
  amountArs: string
  courtName?: string
  date?: string
}

/**
 * Admin alert (ENS-19): un reembolso contra MercadoPago lleva más de 24h en
 * `pending` pese al retry horario (`retry-refunds.worker.ts`). El worker
 * sigue reintentando con la misma idempotency key, pero el dueño tiene que
 * resolverlo manualmente desde el panel de MP mientras tanto — un reembolso
 * prometido a un jugador no puede depender de una query manual semanal.
 */
export function renderAdminRefundFailed(data: AdminRefundFailedData): EmailContent {
  const refundRef = data.refundPaymentId.slice(0, 8)
  const bookingRef = data.bookingId?.slice(0, 8)
  const subject = `⚠️ Reembolso pendiente hace más de 24h — acción requerida`
  const detailRows = [
    data.courtName
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(data.courtName)}</td></tr>`
      : '',
    data.date
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>`
      : '',
    bookingRef
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Reserva</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">#${bookingRef}</td></tr>`
      : '',
  ].join('')
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Reembolso pendiente hace más de 24h</h2>
  <p>Un reembolso de <strong>$${data.amountArs}</strong> (#${refundRef}) sigue <strong>pendiente</strong> en MercadoPago pese a los reintentos automáticos.</p>
  <p><strong>Se requiere acción manual</strong>: revisá el reembolso en el panel de MercadoPago y resolvelo desde ahí. El sistema va a seguir reintentando, pero no vamos a volver a avisarte de este mismo reembolso.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    ${detailRows}
    <tr><td style="padding:8px 0;font-weight:600;width:40%">Reembolso</td><td style="padding:8px 0">#${refundRef}</td></tr>
  </table>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Reembolso pendiente hace más de 24h — acción requerida\n\nUn reembolso de $${data.amountArs} (#${refundRef}) sigue pendiente en MercadoPago pese a los reintentos automáticos.\nSe requiere acción manual: revisá el reembolso en el panel de MercadoPago y resolvelo desde ahí. El sistema va a seguir reintentando, pero no vamos a volver a avisarte de este mismo reembolso.${data.courtName ? `\n\nCancha: ${data.courtName}` : ''}${data.date ? `\nFecha: ${data.date}` : ''}${bookingRef ? `\nReserva: #${bookingRef}` : ''}\n\n— TurnoGol`
  return { subject, html, text }
}
