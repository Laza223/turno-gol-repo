import type { EmailContent } from './index'

export type AdminDepositAfterCloseData = {
  bookingId: string
  /** Pre-formatted ARS amount, e.g. "3.000,00". */
  amountArs: string
  courtName?: string
  date?: string
}

/**
 * Admin alert: MercadoPago aprobó la seña DESPUÉS de que el admin cerró la
 * caja del día. La reserva quedó confirmada (el pago es real), pero el
 * movimiento no pudo registrarse en cash_flows (`assertDayOpen` lo rechaza y
 * `recordDepositCashFlow` lo saltea a propósito para no perder la
 * confirmación). Sin este aviso, esa plata no figura en ningún resumen de
 * caja y solo quedaba un warning en Sentry — invisible para el dueño.
 */
export function renderAdminDepositAfterClose(data: AdminDepositAfterCloseData): EmailContent {
  const ref = data.bookingId.slice(0, 8)
  const subject = `Seña cobrada con la caja ya cerrada (reserva #${ref})`
  const detailRows = [
    data.courtName
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.courtName}</td></tr>`
      : '',
    data.date
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>`
      : '',
  ].join('')
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#d97706">Seña cobrada después del cierre de caja</h2>
  <p>Se cobró una seña de <strong>$${data.amountArs}</strong> por Mercado Pago para la reserva <strong>#${ref}</strong>, pero la caja del día ya estaba cerrada.</p>
  <p>La reserva quedó <strong>confirmada</strong> y el pago es real — solo que el movimiento <strong>no figura en la caja</strong>. Tenelo en cuenta al arquear, o registralo a mano al día siguiente.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    ${detailRows}
    <tr><td style="padding:8px 0;font-weight:600;width:40%">Reserva</td><td style="padding:8px 0">#${ref}</td></tr>
  </table>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Seña cobrada con la caja ya cerrada\n\nSe cobró una seña de $${data.amountArs} por Mercado Pago para la reserva #${ref}, pero la caja del día ya estaba cerrada.\nLa reserva quedó confirmada y el pago es real — solo que el movimiento no figura en la caja. Tenelo en cuenta al arquear, o registralo a mano al día siguiente.${data.courtName ? `\n\nCancha: ${data.courtName}` : ''}${data.date ? `\nFecha: ${data.date}` : ''}\n\n— TurnoGol`
  return { subject, html, text }
}
