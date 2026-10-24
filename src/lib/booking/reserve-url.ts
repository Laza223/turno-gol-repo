import { formatLabel } from '@/components/public/courtFacets'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { addDays } from '@/shared/dates/art'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'
import { formatDayHeader } from '@/lib/format'
import { bookingCode } from '@/lib/booking-code'
import { resolveTenantContact, type TenantContactSource } from '@/lib/tenant-contact'

/**
 * Lo que el jugador eligió en la página del complejo, guardado en la URL (`?date=&formato=&hora=`)
 * para que el link compartido y "Volver" desde confirmar lo conserven.
 */
export type ReserveState = {
  /** YYYY-MM-DD, siempre dentro de [hoy, hoy + anticipación]. */
  date: string
  /** Jugadores por lado (5 = Fútbol 5); `null` = todos los formatos. */
  formato: number | null
  /** HH:MM, en la forma de la etiqueta de un slot. Que la fila exista lo valida el componente. */
  hora: string | null
}

type ParseContext = {
  /** Hoy en ART, YYYY-MM-DD. */
  today: string
  /** `PublicTenant.bookingAdvanceDays`. */
  advanceDays: number
  /** Formatos que el complejo tiene. */
  formats: readonly number[]
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * `formato` de la URL: `String(n) === raw` descarta "05", "5.0" y " 5": solo la forma canónica
 * cuenta, y solo si es uno de los formatos de la lista. Lo inválido es `null`, nunca tira.
 */
export function parseFormato(
  raw: string | null | undefined,
  formats: readonly number[],
): number | null {
  const n = raw == null ? NaN : Number(raw)
  return String(n) === raw && formats.includes(n) ? n : null
}

/** Cómo paga el jugador. Con seña la única vía es MercadoPago; sin seña, lo que el complejo acepta. */
export const PAY_METHODS = ['mercadopago', 'cash', 'transfer'] as const
export type PayMethod = (typeof PAY_METHODS)[number]

/** `pay` de la URL: un método de los que ESTE complejo ofrece, o `null` (cae al primero). */
export function parsePay(raw: unknown, allowed: readonly PayMethod[]): PayMethod | null {
  return allowed.find((m) => m === raw) ?? null
}

/**
 * Lee el estado de la URL. Todo lo inválido cae al valor neutro, nunca tira: la URL la edita
 * cualquiera. Una fecha fuera de la ventana de reserva (o inexistente) vuelve a hoy, igual que
 * lo hacía la grilla anterior.
 */
export function parseReserveState(
  params: { get(name: string): string | null },
  { today, advanceDays, formats }: ParseContext,
): ReserveState {
  const rawDate = params.get('date')
  const inWindow =
    rawDate !== null &&
    isValidCalendarDate(rawDate) &&
    rawDate >= today &&
    rawDate <= addDays(today, advanceDays)

  const rawHora = params.get('hora')

  return {
    date: inWindow ? rawDate : today,
    formato: parseFormato(params.get('formato'), formats),
    hora: rawHora !== null && HORA.test(rawHora) ? rawHora : null,
  }
}

/**
 * Copia de `current` con los params de la reserva puestos. `null` borra el param, `undefined` lo
 * deja como está; todos los demás (utm, ref…) se conservan. Para `history.replaceState`: el
 * historial no se llena al navegar días.
 */
export function writeReserveParams(
  current: URLSearchParams | string,
  next: Partial<ReserveState & { pay: PayMethod }>,
): URLSearchParams {
  const params = new URLSearchParams(current)
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue
    if (value === null) params.delete(key)
    else params.set(key, String(value))
  }
  return params
}

/** `replaceState` y no `push`: elegir días no llena el historial. Conserva los demás params (utm, ref…). */
export function replaceReserveUrl(patch: Partial<ReserveState & { pay: PayMethod }>): void {
  const query = writeReserveParams(window.location.search, patch).toString()
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
  )
}

/** La ficha del complejo con lo que el jugador había elegido: el "Volver" y el "Elegir otro turno". */
export function buildFichaHref(slug: string, state: Partial<ReserveState>): string {
  const query = writeReserveParams('', state).toString()
  return `/${slug}${query ? `?${query}` : ''}`
}

/**
 * El vínculo firmado que confirma la reserva sola (`@/shared/security/booking-intent`) viaja con
 * este nombre en el `next` del magic link y en el form de confirmar. Distinto del `intent` que usa
 * `/verify`. Vive acá, y no junto a la firma, porque el cliente lo lee para sacarlo de la URL y
 * `booking-intent.ts` importa `node:crypto`.
 */
export const BOOKING_INTENT_PARAM = 'booking_intent'

/**
 * Link a confirmar: el contrato de `reservar/page.tsx` (cancha, día, hora y duración del turno).
 * `formato` (el filtro de la ficha) y `pay` (cómo paga) viajan para sobrevivir al ingreso y a los
 * reintentos: el `next` del ingreso y el `backTo` de la action salen TODOS de acá.
 */
export function buildReservarHref(
  slug: string,
  {
    courtId,
    date,
    time,
    formato,
    pay,
  }: {
    courtId: string
    date: string
    time: string
    formato?: number | null
    pay?: PayMethod | null
  },
): string {
  const base = `/${slug}/reservar?court=${courtId}&date=${date}&time=${time}&dur=${SLOT_DURATION_MINUTES}`
  return `${base}${formato ? `&formato=${formato}` : ''}${pay ? `&pay=${pay}` : ''}`
}

export type ReserveRequest = {
  /** Qué rotular en el botón: "WhatsApp" o "Llamar". */
  channel: 'whatsapp' | 'tel'
  href: string
}

/**
 * Pedido de turno para un complejo SIN reserva online: abre WhatsApp con el mensaje escrito
 * (`resolveTenantContact`: el WhatsApp del complejo, o su teléfono si no cargó uno) y, si el
 * número no sirve para WhatsApp, marca el teléfono. `null` si no hay nada marcable.
 */
export function buildReserveRequest(
  tenant: TenantContactSource,
  court: { name: string; format: number },
  date: string,
  time: string,
): ReserveRequest | null {
  const text = `Hola, quiero reservar un turno el ${formatDayHeader(date)} a las ${time} (${court.name}, ${formatLabel(court.format)}).`
  const contact = resolveTenantContact(tenant, text)
  if (contact.whatsappUrl) return { channel: 'whatsapp', href: contact.whatsappUrl }
  return contact.telHref ? { channel: 'tel', href: contact.telHref } : null
}

/**
 * "Escribirle al complejo" desde la vuelta de una reserva cuyo pago no salió (o no sabemos si
 * salió): el mismo canal que `buildReserveRequest`, con la reserva escrita para que el complejo la
 * encuentre (el código pegado en su buscador la trae). `null` si no hay nada marcable: la pantalla
 * no dibuja el botón.
 */
export function buildBookingContact(
  tenant: TenantContactSource & { name: string },
  booking: { id: string; startsOn: string; timeStart: string; courtName: string },
): ReserveRequest | null {
  const text = `Hola ${tenant.name}, te escribo por la seña de mi reserva ${bookingCode(booking.id)} del ${formatDayHeader(booking.startsOn)} a las ${booking.timeStart.slice(0, 5)} (${booking.courtName}).`
  const contact = resolveTenantContact(tenant, text)
  if (contact.whatsappUrl) return { channel: 'whatsapp', href: contact.whatsappUrl }
  return contact.telHref ? { channel: 'tel', href: contact.telHref } : null
}

/** Las tres pantallas de vuelta de una reserva: `/reserva/{id}/{view}`. */
export type ReservaView = 'exito' | 'pendiente' | 'error'

export function buildReservaHref(bookingId: string, view: ReservaView): string {
  return `/reserva/${bookingId}/${view}`
}

/**
 * Sin sesión, las pantallas de vuelta mandan a ingresar y VUELVEN a donde iba el jugador:
 * MercadoPago puede devolverlo en otro navegador, sin la cookie. `sanitizeNext` valida el destino.
 */
export function buildIngresarForReservaHref(bookingId: string, view: ReservaView): string {
  return `/ingresar?next=${encodeURIComponent(buildReservaHref(bookingId, view))}`
}

/**
 * "Reservar de nuevo": la ficha del complejo en el día de la reserva que no salió. Sin complejo
 * conocido (defensivo: la reserva siempre tiene uno), el buscador.
 */
export function buildReserveAgainHref(
  slug: string | null | undefined,
  date: string | null | undefined,
): string {
  return slug ? buildFichaHref(slug, date ? { date } : {}) : '/explorar'
}
