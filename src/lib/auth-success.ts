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

export type SuccessIntent = 'login' | 'signup'

const VALID_INTENTS = new Set<SuccessIntent>(['login', 'signup'])

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

// `/rival/p/<code>` (el partido por link) o `/rival/partido/<uuid>` (el partido del tablón), seguidos
// de `?` o del fin: el código son 10 símbolos del alfabeto de los referidos (mismo que
// `inviteCodeSchema`) y el id un uuid en minúscula (8-4-4-4-12), así que no pasan `/rival/pX`,
// `/rival/p/x/../../admin`, sufijos ni `\`, `?` o `#` antes del fin del path. `/x?a=/rival/p/y`
// es el path `/x`.
// El alfabeto es una copia de `REFERRAL_CODE_ALPHABET` (@/lib no importa del dominio): el test de
// `isRivalPath` vigila que coincidan.
const RIVAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const RIVAL_ID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const RIVAL_PATH_RE = new RegExp(
  `^/rival/(?:p/[${RIVAL_CODE_ALPHABET}]{10}|partido/${RIVAL_ID_PATTERN})(?:\\?|$)`,
)

/**
 * ¿`next` es un partido de RIVAL (por link o del tablón)? El jugador que tocó "Voy" o "Pedir sumarme"
 * vuelve DIRECTO ahí (sin `/verify`): ya eligió el partido y tiene que volver a él. Se usa con un `next` ya saneado.
 */
export function isRivalPath(next: string): boolean {
  return RIVAL_PATH_RE.test(next)
}

// Las pantallas de RIVAL sin id: la portada, el tablón, armar y Mis partidos. Mismo cuidado que los otros: `?` o
// fin de path, sin sufijos ni barras.
const RIVAL_HOME_RE = /^\/rival(?:\/tablon|\/nuevo|\/mis-partidos)?(?:\?|$)/

/**
 * ¿`next` es cualquier pantalla de RIVAL a la que se vuelve DIRECTO tras entrar? Suma, a los partidos de
 * `isRivalPath`, la portada, armar y Mis partidos: quien ya eligió adónde iba no pasa por `/verify`.
 */
export function isRivalReturnPath(next: string): boolean {
  return RIVAL_HOME_RE.test(next) || isRivalPath(next)
}

/** Arma el path de éxito de `/verify` con `next` encodeado e `intent`. */
export function successVerifyPath(next: string, intent: SuccessIntent): string {
  return `/verify?status=success&next=${encodeURIComponent(next)}&intent=${intent}`
}
