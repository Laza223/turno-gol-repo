/**
 * Clientes que dejaron de venir (`/jugadores?filtro=dejaron-de-venir`).
 * Decisión del dueño: docs/decisions/2026-10-22-clientes-que-dejaron-de-venir.md.
 *
 * "Dejó de venir" se CALCULA al leer (`listTenantClients`) y no se guarda: no
 * es una etiqueta del ENUM de 5 ni texto sobre la persona (Ley 25.326).
 */

/** Sin reservar hace más de esto → dejó de venir. 4 semanas, fijo: no es configurable. */
export const DORMANT_AFTER_DAYS = 28

/** Reservas que no se cayeron que hacen falta para contar como cliente que venía. */
export const DORMANT_MIN_BOOKINGS = 3

/** Valor de `?filtro=` en la URL de `/jugadores`. */
export const DORMANT_FILTER_PARAM = 'dejaron-de-venir'

const DAY_MS = 86_400_000

/**
 * "hace 5 semanas" a partir del inicio de la última reserva. En semanas hasta
 * los dos meses, que es la escala en la que juega un habitual; después en
 * meses, porque "hace 23 semanas" ya no se lee de un vistazo.
 */
export function lastSeenLabel(iso: string, nowMs: number): string {
  const days = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / DAY_MS))
  const weeks = Math.floor(days / 7)
  if (weeks < 9) {
    if (weeks === 0) return 'esta semana'
    return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`
  }
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`
  return 'hace más de un año'
}

/**
 * El mensaje que trae precargado el botón de WhatsApp. Es la voz del complejo:
 * lo manda el dueño o el encargado desde su teléfono, uno por uno, y lo puede
 * editar antes de mandarlo. Sin URL absoluta no va la invitación a reservar:
 * un link relativo no le sirve a nadie.
 */
export function winBackMessage(input: {
  name: string
  tenantName: string
  publicUrl: string | null
}): string {
  const firstName = input.name.trim().split(/\s+/)[0] ?? ''
  const greeting = firstName ? `Hola ${firstName}!` : 'Hola!'
  const body = `${greeting} ¿Cómo andás? Te escribimos de ${input.tenantName}. Hace un tiempo que no te vemos por acá.`
  return input.publicUrl ? `${body} Si querés volver, reservá acá: ${input.publicUrl}` : body
}
