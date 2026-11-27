import { MAX_HOURS, type StoryHour, type StoryModel } from '@/lib/story-image/model'
import { addDays } from '@/shared/dates/art'
import type { AvailabilityResponse, PublicTenant } from './public.service'

/** Por qué no se puede armar la placa de un día. */
export type StoryFailure = 'no_courts' | 'closed' | 'over' | 'full' | 'taken'

export type StoryResult = { ok: true; model: StoryModel } | { ok: false; reason: StoryFailure }

/** Mensajes para el dueño (voseo), uno por motivo. Los muestra el diálogo tal cual. */
export const STORY_FAILURE_MESSAGES: Record<StoryFailure, string> = {
  no_courts: 'El complejo no tiene canchas activas para mostrar.',
  closed: 'El complejo está cerrado ese día.',
  over: 'Ya pasaron todos los turnos de hoy.',
  full: 'No quedan turnos libres ese día. Elegí otro día.',
  taken: 'Esos horarios ya no están libres. Elegí otros.',
}

const WEEKDAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
const MONTHS = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
]

const MAX_NAME_LENGTH = 64

// Todo lo que la placa puede dibujar con las fuentes que trae: Latin-1 más un
// puñado de puntuación. Cualquier otro glifo (emoji, cirílico, CJK) haría que
// satori salga a buscar una fuente o un twemoji a la red en pleno render — y
// `tenants.name` es texto libre del dueño.
const UNSUPPORTED_GLYPHS =
  /[^\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g

export function sanitizeName(raw: string, fallback: string): string {
  // Tabs y saltos de línea pasan a espacio (no se borran como "no dibujables", que
  // pegaría las palabras) y el colapso va DESPUÉS de sacar los glifos: borrar un
  // emoji entre dos espacios deja dos.
  const clean = raw
    .normalize('NFC')
    .replace(/\s/g, ' ')
    .replace(UNSUPPORTED_GLYPHS, '')
    .replace(/ +/g, ' ')
    .trim()
  if (!clean) return fallback
  return clean.length > MAX_NAME_LENGTH
    ? `${clean.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…`
    : clean
}

/** Día de la semana y día del mes de un 'YYYY-MM-DD', sin pasar por Intl ni por la zona del server. */
function dayParts(date: string): { weekday: string; day: number; month: string } {
  const d = new Date(`${date}T12:00:00Z`)
  return { weekday: WEEKDAYS[d.getUTCDay()], day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] }
}

type Courts = AvailabilityResponse['courts']

/**
 * Las horas con al menos una cancha libre, en orden operativo, y si queda algún
 * turno por venir. Compartida con el diálogo del panel: lo que ofrece como
 * elegible tiene que ser exactamente lo que la placa puede dibujar.
 *
 * El orden sale de TODOS los slots, no solo de los libres, y nunca se ordena
 * el string: en un complejo que cierra pasada la medianoche '00:00' va
 * después de '23:00' y como texto sería menor que '19:00'. Si el orden
 * saliera de los libres, una hora ocupada en la primera cancha y libre en la
 * segunda caería al final.
 */
function scanHours(courts: Courts): { allHours: StoryHour[]; anyUpcoming: boolean } {
  const order = new Set<string>()
  const freeByTime = new Map<string, number>()
  let anyUpcoming = false
  for (const court of courts) {
    for (const slot of court.slots) {
      order.add(slot.time)
      if (slot.status !== 'past') anyUpcoming = true
      if (slot.status === 'free') freeByTime.set(slot.time, (freeByTime.get(slot.time) ?? 0) + 1)
    }
  }
  const allHours: StoryHour[] = []
  for (const time of order) {
    const freeCourts = freeByTime.get(time)
    if (freeCourts) allHours.push({ time, freeCourts })
  }
  return { allHours, anyUpcoming }
}

export function freeHoursOf(availability: AvailabilityResponse): StoryHour[] {
  return scanHours(availability.courts).allHours
}

/**
 * Convierte la disponibilidad pública de un día en lo que dibuja la placa.
 * Pura y determinista: el "hoy" entra por parámetro.
 *
 * "Libre" es `status === 'free'`. `held` (hold de pago), `occupied` y `past` no
 * cuentan: la placa no le ofrece al jugador un turno que otro está pagando.
 */
export function buildStoryModel(input: {
  tenant: Pick<PublicTenant, 'name' | 'slug' | 'allowOnlineBooking'>
  availability: AvailabilityResponse
  /** 'YYYY-MM-DD' de hoy en ART. */
  todayStr: string
  /** URL absoluta del portal del complejo. */
  portalUrl: string
  /** Horas ('HH:MM') que el dueño eligió mostrar; sin esto, las primeras libres. */
  only?: string[]
}): StoryResult {
  const { tenant, availability, todayStr, portalUrl, only } = input
  const { courts } = availability

  if (courts.length === 0) return { ok: false, reason: 'no_courts' }
  if (courts.every((court) => court.slots.length === 0)) return { ok: false, reason: 'closed' }

  const { allHours, anyUpcoming } = scanHours(courts)
  if (!anyUpcoming) return { ok: false, reason: 'over' }
  if (allHours.length === 0) return { ok: false, reason: 'full' }

  // Con una elección del dueño solo entran esas horas, siempre en orden operativo
  // (nunca el del pedido) y sin "y N más": dejó afuera las otras a propósito.
  const chosen = only ? new Set(only) : null
  const picked = chosen ? allHours.filter((h) => chosen.has(h.time)) : allHours
  if (picked.length === 0) return { ok: false, reason: 'taken' }

  const { date } = availability
  const parts = dayParts(date)
  const isToday = date === todayStr
  const isTomorrow = date === addDays(todayStr, 1)
  const dayWord = isToday ? 'HOY' : isTomorrow ? 'MAÑANA' : parts.weekday
  const kicker =
    isToday || isTomorrow
      ? `${dayWord} · ${parts.weekday}`
      : `${parts.weekday} · ${parts.day} DE ${parts.month}`

  return {
    ok: true,
    model: {
      kicker,
      dayWord,
      tenantName: sanitizeName(tenant.name, tenant.slug),
      // Las primeras en orden operativo: como el servicio ya sacó las que
      // pasaron, son las próximas en jugarse.
      hours: picked.slice(0, MAX_HOURS),
      hiddenHours: chosen ? 0 : Math.max(0, picked.length - MAX_HOURS),
      cta: tenant.allowOnlineBooking ? 'RESERVÁ TU CANCHA' : 'MIRÁ LOS HORARIOS',
      portalHost: portalUrl.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
    },
  }
}
