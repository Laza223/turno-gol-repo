import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type PlayerLatePaymentRefundedData = {
  playerFirstName: string
  courtName: string
  date: string
  timeStart: string
  tenantName: string
  /** Pre-formatted ARS amount, e.g. "3.000,00". */
  amountArs: string
}

/**
 * Aviso al JUGADOR: MercadoPago acreditó su seña después de que la reserva
 * expirara, así que no hay turno y la plata vuelve automáticamente (decisión
 * del dueño 2026-08-19). Hasta ese cambio al jugador no se le avisaba nada —
 * solo se le mandaba un mail al complejo pidiéndole acción manual, y el único
 * que había puesto plata se quedaba sin turno y sin noticias.
 */
export function renderPlayerLatePaymentRefunded(
  data: PlayerLatePaymentRefundedData,
): EmailContent {
  const subject = `Te devolvemos la seña — ${data.courtName}, ${data.date} ${data.timeStart}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Tu seña vuelve a tu cuenta</h2>
  <p>Hola ${escapeHtml(data.playerFirstName)},</p>
  <p>El pago de tu seña en <strong>${escapeHtml(data.tenantName)}</strong> se acreditó después de que el turno se liberara, así que la reserva no quedó tomada.</p>
  <p><strong>Ya pedimos la devolución de $${data.amountArs} a MercadoPago.</strong> El dinero vuelve al mismo medio de pago que usaste; MercadoPago puede tardar unos días hábiles en mostrarlo.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(data.courtName)}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Horario</td><td style="padding:8px 0">${data.timeStart}</td></tr>
  </table>
  <p>Si querés el turno igual, reservá de nuevo desde la app — o hablá con el complejo para que te lo asignen a otro horario.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Tu seña vuelve a tu cuenta\n\nHola ${data.playerFirstName},\n\nEl pago de tu seña en ${data.tenantName} se acreditó después de que el turno se liberara, así que la reserva no quedó tomada.\n\nYa pedimos la devolución de $${data.amountArs} a MercadoPago. El dinero vuelve al mismo medio de pago que usaste; puede tardar unos días hábiles.\n\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart}\n\nSi querés el turno igual, reservá de nuevo desde la app.\n\n— TurnoGol`
  return { subject, html, text }
}
