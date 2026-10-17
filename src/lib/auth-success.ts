/**
 * Helpers para la pantalla de éxito post magic-link. El callback verifica la
 * sesión y redirige a `/verify?status=success&next=&intent=` (salvo una reserva en
 * curso, que vuelve directo); estos helpers arman esa URL. Puros y testeables (sin I/O).
 */

/**
 * Vía por la que un JUGADOR pidió entrar. La marca el emisor (auth.service) como
 * `via=` en el `redirectTo`, el callback la lee para saber que el enlace es de
 * jugador (las altas e invitaciones de staff no la llevan) y `/verify` la usa
 * para ofrecer el reintento correcto.
 */
export type PlayerVia = 'email' | 'google'

/** Valida el `via` de la URL; cualquier otro valor (o ausencia) → `null`, sin marca. */
export function parseVia(raw: string | null | undefined): PlayerVia | null {
  return raw === 'email' || raw === 'google' ? raw : null
}

export type SuccessIntent = 'booking' | 'booking_returning' | 'login' | 'signup'

const VALID_INTENTS = new Set<SuccessIntent>(['booking', 'booking_returning', 'login', 'signup'])

/** Valida el `intent` de la URL; cualquier valor fuera del set → `login`. */
export function parseIntent(raw: string | null | undefined): SuccessIntent {
  return raw && VALID_INTENTS.has(raw as SuccessIntent) ? (raw as SuccessIntent) : 'login'
}

// `/<slug>/reservar` seguido de `?` o del fin: la pantalla no tiene subrutas, así que no pasan
// `/x/reservartrampa` ni `/club/reservar/../../admin`. El slug no admite `/`, `\` (el navegador lo
// lee como `/`), `?` ni `#`: `/x?a=/reservar` es el path `/x`, no una reserva.
const BOOKING_PATH_RE = /^\/[^/\\?#]+\/reservar(?:\?|$)/

/**
 * ¿`next` es la pantalla de confirmar de un complejo? El jugador que entra con una reserva en curso
 * vuelve DIRECTO ahí (el callback y `/aceptar-terminos` no lo pasan por `/verify`): ya tocó
 * "Continuar" una vez y tiene que volver con la reserva hecha. Se usa con un `next` ya saneado.
 */
export function isBookingPath(next: string): boolean {
  return BOOKING_PATH_RE.test(next)
}

/** Arma el path de éxito de `/verify` con `next` encodeado e `intent`. */
export function successVerifyPath(next: string, intent: SuccessIntent): string {
  return `/verify?status=success&next=${encodeURIComponent(next)}&intent=${intent}`
}
