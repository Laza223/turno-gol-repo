import type { EmailContent } from './index'

export type BookingRescheduledData = {
  playerFirstName: string
  tenantName: string
  /** De dónde se movió. */
  fromCourtName: string
  fromDate: string
  fromTimeStart: string
  fromTimeEnd: string
  /** A dónde quedó. */
  toCourtName: string
  toDate: string
  toTimeStart: string
  toTimeEnd: string
  /** Precio del turno ya recalculado a la franja destino, formateado en ARS. */
  price: string
  /** True si el precio cambió al mover: se destaca para que no sea una sorpresa. */
  priceChanged: boolean
}

/**
 * El turno se movió (doc7 Flujo 4 análogo). Se manda SIEMPRE que la reserva
 * tenga un jugador registrado: el admin ya arregló por teléfono, este mail es
 * el comprobante de lo que quedó, no un pedido de confirmación.
 *
 * Muestra el origen tachado y el destino destacado — leer "de X a Y" de un
 * vistazo es lo único que importa acá. Si el precio cambió (la franja destino
 * vale distinto), se dice explícitamente: enterarse al llegar sería peor.
 */
export function renderBookingRescheduled(data: BookingRescheduledData): EmailContent {
  const subject = `Turno reprogramado — ${data.toCourtName}, ${data.toDate} ${data.toTimeStart}`
  const priceLine = data.priceChanged
    ? `<p style="margin:16px 0;padding:12px;background:#fffbeb;border-left:3px solid #d97706;font-size:14px"><strong>El precio del turno cambió:</strong> ahora es ${data.price} (la franja nueva tiene otra tarifa).</p>`
    : `<p style="color:#64748b;font-size:14px">Precio del turno: ${data.price}</p>`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#047857">Tu turno se movió</h2>
  <p>Hola ${data.playerFirstName},</p>
  <p>Tu reserva en <strong>${data.tenantName}</strong> quedó reprogramada.</p>
  <p style="margin:16px 0;color:#94a3b8;font-size:14px;text-decoration:line-through">
    Antes: ${data.fromCourtName} · ${data.fromDate} · ${data.fromTimeStart} – ${data.fromTimeEnd}
  </p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;width:40%">Cancha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.toCourtName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${data.toDate}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600">Horario</td><td style="padding:8px 0">${data.toTimeStart} – ${data.toTimeEnd}</td></tr>
  </table>
  ${priceLine}
  <p style="color:#64748b;font-size:14px">Si el horario nuevo no te sirve, contactá al complejo.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Tu turno se movió\n\nHola ${data.playerFirstName},\n\nTu reserva en ${data.tenantName} quedó reprogramada.\n\nAntes: ${data.fromCourtName} · ${data.fromDate} · ${data.fromTimeStart} – ${data.fromTimeEnd}\n\nAhora:\nCancha: ${data.toCourtName}\nFecha: ${data.toDate}\nHorario: ${data.toTimeStart} – ${data.toTimeEnd}\n${data.priceChanged ? `\nEl precio del turno cambió: ahora es ${data.price} (la franja nueva tiene otra tarifa).` : `Precio del turno: ${data.price}`}\n\nSi el horario nuevo no te sirve, contactá al complejo.\n\n— TurnoGol`
  return { subject, html, text }
}
