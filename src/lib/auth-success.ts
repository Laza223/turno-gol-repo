/**
 * Helpers para la pantalla de éxito post magic-link. El callback verifica la
 * sesión y redirige a `/verify?status=success&next=&intent=`; estos helpers
 * derivan el intent y arman esa URL. Puros y testeables (sin I/O).
 */

export type SuccessIntent = 'booking' | 'booking_returning' | 'login' | 'signup'

const VALID_INTENTS = new Set<SuccessIntent>(['booking', 'booking_returning', 'login', 'signup'])

/** Valida el `intent` de la URL; cualquier valor fuera del set → `login`. */
export function parseIntent(raw: string | null | undefined): SuccessIntent {
  return raw && VALID_INTENTS.has(raw as SuccessIntent) ? (raw as SuccessIntent) : 'login'
}

// `/<slug>/reservar` seguido de fin, `/` o `?` — evita falsos positivos tipo
// `/x/reservartrampa`.
const BOOKING_PATH_RE = /^\/[^/]+\/reservar(?:[/?]|$)/

/**
 * Distingue si el jugador volvía de reservar (booking) o de un login común.
 *
 * `isNewPlayer` (default `true`, para no romper callers/tests que todavía no
 * lo pasan) separa el alta real del re-acceso: un jugador YA existente que
 * pide magic link con `next` de reserva NO vio ningún alta — mostrarle
 * "¡Cuenta confirmada!" (copy de `booking`) es el hallazgo QA que esto
 * corrige. `booking_returning` conserva el mismo subtítulo/CTA de "volvé a tu
 * reserva" (sigue siendo cierto) pero con el título neutral de `login`.
 */
export function playerSuccessIntent(
  next: string,
  isNewPlayer = true,
): 'booking' | 'booking_returning' | 'login' {
  if (!BOOKING_PATH_RE.test(next)) return 'login'
  return isNewPlayer ? 'booking' : 'booking_returning'
}

/** Arma el path de éxito de `/verify` con `next` encodeado e `intent`. */
export function successVerifyPath(next: string, intent: SuccessIntent): string {
  return `/verify?status=success&next=${encodeURIComponent(next)}&intent=${intent}`
}
