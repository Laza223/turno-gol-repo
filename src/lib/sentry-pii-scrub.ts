/**
 * PII scrubbing helpers for Sentry beforeSend (Ley 25.326 / B9 audit).
 *
 * Scrub structured fields whose names commonly carry personal data so they
 * never reach Sentry. Used by sentry.server.config.ts. Exported separately so
 * it can be unit-tested without spinning up Sentry.
 */
import { redactQueryParams } from '@/shared/lib/redact-query-params'

export const PII_KEYS: ReadonlySet<string> = new Set([
  'email',
  'phone',
  'phone_number',
  'dni',
  'mp_access_token',
  'mp_refresh_token',
  'access_token',
  'refresh_token',
  // `token` a secas: el regex viejo de `scrubQueryString` lo cubría por fuera
  // de esta lista (ver hallazgo #7) — se suma acá para que quede una sola
  // fuente y no se pierda cobertura al unificar.
  'token',
  'authorization',
  // Vínculo firmado que confirma la reserva sola (`@/shared/security/booking-intent`): viaja en el
  // `next` del magic link y vale por un turno y un email, así que no se reporta.
  'booking_intent',
])

export function scrubObject(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj
  // Por CONTENIDO y no sólo por nombre de clave (H-7): el mensaje de una
  // consulta fallida de Drizzle trae los parámetros enlazados, y llega bajo
  // claves inocentes (`error`, `message`, `value`) que ninguna lista de nombres
  // va a atrapar. El logger ya lo recorta en origen; esto cubre los eventos que
  // no pasan por él, como los `captureException` directos.
  // Y las URLs que viajan como texto (migas de navegación y de fetch, `extra`): una clave de
  // PII_KEYS en su query string se tapa igual que en `request.query_string`.
  if (typeof obj === 'string') return scrubQueryString(redactQueryParams(obj))
  if (Array.isArray(obj)) return obj.map((item) => scrubObject(item, depth + 1))
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (PII_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]'
      } else {
        out[k] = scrubObject(v, depth + 1)
      }
    }
    return out
  }
  return obj
}

// Construido desde PII_KEYS a propósito: antes era una segunda lista a mano
// (`email|token|access_token|refresh_token`) que se desincronizó de la de
// arriba — `mp_access_token`/`mp_refresh_token`/`phone`/`phone_number`/`dni`
// estaban en PII_KEYS pero el regex nunca los reconocía (hallazgo #7, campaña
// de mutación). Una sola fuente de verdad: agregar una clave nueva a
// PII_KEYS ahora cubre objetos Y query strings.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const PII_QUERY_PATTERN = new RegExp(
  // `\s` corta el valor: ahora este patrón también pasa por textos que no son una URL (mensajes,
  // stacks, `context_line`) y sin el corte se comía todo hasta el próximo `&` o el final.
  `([?&])(${[...PII_KEYS].map(escapeRegExp).join('|')})=[^&\\s]*`,
  'gi',
)

// Dentro de un `next=` (el callback del magic link) el vínculo de la reserva viaja codificado
// (`%26booking_intent%3D<token>`), y doble codificado en el `redirect_to` que `@supabase/auth-js`
// manda al pedir el enlace (`%2526booking_intent%253D<token>`). El patrón de arriba, que busca
// `?k=` / `&k=`, no ve ninguno de los dos. El token es base64url más un punto: corta en el primer
// carácter fuera de ese set.
const ENCODED_BOOKING_INTENT = /booking_intent(%3D|%253D)[\w.-]*/gi

export function scrubQueryString(qs: string): string {
  return qs
    .replace(PII_QUERY_PATTERN, '$1$2=[REDACTED]')
    .replace(ENCODED_BOOKING_INTENT, 'booking_intent$1[REDACTED]')
}

/**
 * Tapado completo de un evento antes de mandarlo al reporte de errores.
 *
 * Vive acá, y no duplicado en los dos `beforeSend`, porque el web y el de
 * workers venían tapando distinto y ninguno de los dos tocaba las migas de
 * navegación ni la excepción (H-8 de la auditoría de aislamiento del
 * 2026-09-05). Las migas incluyen lo que se escribió por consola, así que un
 * mismo texto sensible podía viajar por más de un campo del mismo evento.
 *
 * Muta el evento en el lugar, que es como los `beforeSend` ya venían operando.
 * El tipo es estructural a propósito: este módulo no importa el SDK, para poder
 * testearlo sin levantarlo.
 */
type ScrubbableEvent = {
  request?: {
    data?: unknown
    headers?: Record<string, string>
    query_string?: unknown
    url?: unknown
  }
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
  user?: { id?: string | number } | null
  breadcrumbs?: unknown
  exception?: unknown
}

export function scrubEvent(event: ScrubbableEvent): void {
  if (event.request) {
    delete event.request.data
    if (event.request.headers) {
      const h = event.request.headers
      delete h.cookie
      delete h.Cookie
      delete h.authorization
      delete h.Authorization
      // El Referer de un pedido hecho desde `/reservar` lleva la URL con el vínculo de la reserva.
      if (h.referer) h.referer = scrubQueryString(h.referer)
      if (h.Referer) h.Referer = scrubQueryString(h.Referer)
    }
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubQueryString(event.request.query_string)
    }
    if (typeof event.request.url === 'string') {
      event.request.url = scrubQueryString(event.request.url)
    }
  }
  if (event.extra) event.extra = scrubObject(event.extra) as typeof event.extra
  if (event.contexts) event.contexts = scrubObject(event.contexts) as typeof event.contexts
  if (event.breadcrumbs) event.breadcrumbs = scrubObject(event.breadcrumbs)
  if (event.exception) event.exception = scrubObject(event.exception)
  // Se conserva el id para poder rastrear; se van correo, nombre de usuario e IP.
  if (event.user) event.user = { id: event.user.id }
}
