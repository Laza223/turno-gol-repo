import { formatLabel } from '@/components/public/courtFacets'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { addDays } from '@/shared/dates/art'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'
import { formatDayHeader } from '@/lib/format'
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

  // `String(n) === raw` descarta "05", "5.0" y " 5": solo la forma canónica cuenta.
  const rawFormato = params.get('formato')
  const formato = rawFormato === null ? NaN : Number(rawFormato)
  const rawHora = params.get('hora')

  return {
    date: inWindow ? rawDate : today,
    formato: String(formato) === rawFormato && formats.includes(formato) ? formato : null,
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
  next: Partial<ReserveState>,
): URLSearchParams {
  const params = new URLSearchParams(current)
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue
    if (value === null) params.delete(key)
    else params.set(key, String(value))
  }
  return params
}

/** Link a confirmar: el contrato de `reservar/page.tsx` (cancha, día, hora y duración del turno). */
export function buildReservarHref(
  slug: string,
  { courtId, date, time }: { courtId: string; date: string; time: string },
): string {
  return `/${slug}/reservar?court=${courtId}&date=${date}&time=${time}&dur=${SLOT_DURATION_MINUTES}`
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
