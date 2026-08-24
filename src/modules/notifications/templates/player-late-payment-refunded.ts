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
 * expirara, así que no hay turno y hay que devolverle la plata (decisión del
 * dueño 2026-08-19). Hasta ese cambio al jugador no se le avisaba nada — solo
 * se le mandaba un mail al complejo pidiéndole acción manual, y el único que
 * había puesto plata se quedaba sin turno y sin noticias.
 *
 * La copy dice que la devolución está EN CURSO, nunca que ya se hizo. El pedido
 * automático a MercadoPago falla hoy siempre (403 de permisos: MP deriva los
 * scopes del producto de la aplicación y ninguno concede `payments:refunds`),
 * así que este mail salía afirmando un movimiento de plata que no ocurría. La
 * devolución la termina de saldar el complejo desde /caja/devoluciones.
 */
export function renderPlayerLatePaymentRefunded(data: PlayerLatePaymentRefundedData): EmailContent {
  const subject = `Devolución de tu seña en curso — ${data.courtName}, ${data.date} ${data.timeStart}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#dc2626">Te vamos a devolver la seña</h2>
  <p>Hola ${escapeHtml(data.playerFirstName)},</p>
  <p>El pago de tu seña en <strong>${escapeHtml(data.tenantName)}</strong> se acreditó después de que el turno se liberara, así que la reserva no quedó tomada.</p>
  <p><strong>La devolución de $${data.amountArs} está en curso.</strong> La gestiona ${escapeHtml(data.tenantName)} y el dinero vuelve al mismo medio de pago que usaste. Si en unos días no lo ves acreditado, escribile directamente al complejo.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(data.courtName)}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.date}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Horario</td><td style="padding:8px 0">${data.timeStart}</td></tr>
  </table>
  <p>Si querés el turno igual, reservá de nuevo desde la app — o hablá con el complejo para que te lo asignen a otro horario.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Te vamos a devolver la seña\n\nHola ${data.playerFirstName},\n\nEl pago de tu seña en ${data.tenantName} se acreditó después de que el turno se liberara, así que la reserva no quedó tomada.\n\nLa devolución de $${data.amountArs} está en curso. La gestiona ${data.tenantName} y el dinero vuelve al mismo medio de pago que usaste. Si en unos días no lo ves acreditado, escribile directamente al complejo.\n\nCancha: ${data.courtName}\nFecha: ${data.date}\nHorario: ${data.timeStart}\n\nSi querés el turno igual, reservá de nuevo desde la app.\n\n— TurnoGol`
  return { subject, html, text }
}
