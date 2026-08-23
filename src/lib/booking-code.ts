/**
 * Código corto de una reserva: los primeros 8 caracteres del UUID, en mayúscula.
 *
 * No hay columna en la base y no hace falta: `searchCond` (la búsqueda de
 * reservas del admin) hace `b.id::text ILIKE 'prefijo%'`, e `ILIKE` es
 * case-insensitive contra el UUID en minúsculas. O sea, este código pegado tal
 * cual en el buscador encuentra el turno — es un identificador real que el
 * jugador puede pasarle al complejo, no un adorno.
 *
 * Se centraliza acá porque lo usan tres superficies con públicos distintos (el
 * comprobante, la pantalla de verificación y el mensaje de WhatsApp al
 * complejo) y tienen que coincidir carácter por carácter para que sirva de algo.
 */
export function bookingCode(bookingId: string): string {
  return bookingId.slice(0, 8).toUpperCase()
}
