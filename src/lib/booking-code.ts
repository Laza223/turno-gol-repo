/**
 * Código corto de una reserva: los primeros 8 caracteres del UUID, en mayúscula.
 *
 * No hay columna en la base y no hace falta: `searchCond` (la búsqueda de
 * reservas del admin) hace `b.id::text ILIKE 'prefijo%'`, e `ILIKE` es
 * case-insensitive contra el UUID en minúsculas. O sea, este código pegado tal
 * cual en el buscador encuentra el turno — es un identificador real que el
 * jugador puede pasarle al complejo, no un adorno.
 *
 * Se centraliza acá porque lo usan superficies con públicos distintos (los
 * mensajes de WhatsApp del jugador al complejo, los mails de cancelación, el
 * panel de devolución de "Mis reservas", la lista de devoluciones de Caja y el
 * export de datos) y tienen que coincidir carácter por carácter para que sirva
 * de algo.
 *
 * Ojo: el panel NO muestra este código en el detalle de la reserva; solo sirve
 * para que el complejo lo pegue en el buscador cuando le llega escrito. Por eso
 * la pantalla de reserva confirmada del jugador ya no lo lleva (2026-11-19): si
 * nadie del complejo se lo va a pedir, es un dato que no sirve.
 */
export function bookingCode(bookingId: string): string {
  return bookingId.slice(0, 8).toUpperCase()
}
