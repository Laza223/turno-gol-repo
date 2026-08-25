import type { EmailContent } from './index'

export type AdminExternalRefundDetectedData = {
  bookingId: string
  /** Pre-formatted ARS amount, e.g. "3.000,00". */
  amountArs: string
  /**
   * `true` = el sistema pudo poner la seña en 'refunded' solo. `false` = el
   * turno estaba en un estado que no admite el cambio (terminal), así que el
   * dueño tiene que mirarlo a mano. La diferencia cambia qué se le pide hacer.
   */
  reconciled: boolean
  /** Estado del turno cuando NO se pudo reconciliar. Solo se usa con `reconciled:false`. */
  bookingStatus?: string
}

/**
 * Admin alert: alguien reembolsó un pago DESDE EL PANEL DE MERCADO PAGO, por
 * fuera de la app. El webhook llega como `status='refunded'` sin que exista un
 * fila de devolución local que lo explique.
 *
 * Va SOLO al rol `admin` (`onlyRole: 'admin'` en el emisor): es plata y MP, el
 * mismo criterio con el que `requireAdminStaffAction` le cierra Configuración y
 * facturación al encargado.
 *
 * **Al jugador NO se le avisa** (decisión del dueño, 2026-08-05): el complejo
 * hizo ese reembolso por afuera y puede tener una conversación en curso con él;
 * un mail automático la pisaría.
 */
export function renderAdminExternalRefundDetected(
  data: AdminExternalRefundDetectedData,
): EmailContent {
  const ref = data.bookingId.slice(0, 8)
  const subject = `Reembolso hecho desde Mercado Pago (reserva #${ref})`

  const outcomeHtml = data.reconciled
    ? `<p>Ya <strong>marcamos la seña como reembolsada</strong> en el sistema, así que el turno deja de figurar como cobrado. <strong>El turno NO se canceló</strong>: si además hay que liberar el horario, hacelo vos desde Reservas.</p>`
    : `<p><strong>No pudimos actualizarlo solos</strong>: el turno ya está en estado <strong>${data.bookingStatus ?? 'final'}</strong> y no admite cambios. Revisalo a mano — el dinero salió de Mercado Pago igual.</p>`

  const outcomeText = data.reconciled
    ? 'Ya marcamos la seña como reembolsada en el sistema, así que el turno deja de figurar como cobrado. El turno NO se canceló: si además hay que liberar el horario, hacelo vos desde Reservas.'
    : `No pudimos actualizarlo solos: el turno ya está en estado ${data.bookingStatus ?? 'final'} y no admite cambios. Revisalo a mano — el dinero salió de Mercado Pago igual.`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#d97706">Se reembolsó una seña desde Mercado Pago</h2>
  <p>Detectamos un reembolso de <strong>$${data.amountArs}</strong> en la reserva <strong>#${ref}</strong> hecho <strong>directo en el panel de Mercado Pago</strong>, no desde TurnoGol.</p>
  ${outcomeHtml}
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;font-weight:600;width:40%">Reserva</td><td style="padding:8px 0">#${ref}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Monto</td><td style="padding:8px 0">$${data.amountArs}</td></tr>
  </table>
  <p style="color:#64748b;font-size:14px">Al jugador no le avisamos nada: si el reembolso salió de una conversación con él, seguí vos por donde la venías llevando.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`

  const text = `Se reembolsó una seña desde Mercado Pago\n\nDetectamos un reembolso de $${data.amountArs} en la reserva #${ref} hecho directo en el panel de Mercado Pago, no desde TurnoGol.\n${outcomeText}\n\nReserva: #${ref}\nMonto: $${data.amountArs}\n\nAl jugador no le avisamos nada: si el reembolso salió de una conversación con él, seguí vos por donde la venías llevando.\n\n— TurnoGol`

  return { subject, html, text }
}
