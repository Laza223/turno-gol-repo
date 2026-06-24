/**
 * Helpers para la pantalla de éxito post magic-link. El callback verifica la
 * sesión y redirige a `/verify?status=success&next=&intent=`; estos helpers
 * derivan el intent y arman esa URL. Puros y testeables (sin I/O).
 */

export type SuccessIntent = 'booking' | 'login' | 'signup'

const VALID_INTENTS = new Set<SuccessIntent>(['booking', 'login', 'signup'])

/** Valida el `intent` de la URL; cualquier valor fuera del set → `login`. */
export function parseIntent(raw: string | null | undefined): SuccessIntent {
  return raw && VALID_INTENTS.has(raw as SuccessIntent) ? (raw as SuccessIntent) : 'login'
}

// `/<slug>/reservar` seguido de fin, `/` o `?` — evita falsos positivos tipo
// `/x/reservartrampa`.
const BOOKING_PATH_RE = /^\/[^/]+\/reservar(?:[/?]|$)/

/** Distingue si el jugador volvía de reservar (booking) o de un login común. */
export function playerSuccessIntent(next: string): 'booking' | 'login' {
  return BOOKING_PATH_RE.test(next) ? 'booking' : 'login'
}

/** Arma el path de éxito de `/verify` con `next` encodeado e `intent`. */
export function successVerifyPath(next: string, intent: SuccessIntent): string {
  return `/verify?status=success&next=${encodeURIComponent(next)}&intent=${intent}`
}
