// Del formulario de "Armar un partido" al borrador del service, y la precarga desde
// una reserva. Puro (sin DB): las reservas del organizador entran por parámetro.
import { artTodayStr } from '@/shared/dates/art'
import { artDateOf } from '@/shared/time/art-date'
import { uuid } from '@/shared/validation/primitives'
import { artInstantOf, artTimeOf } from './rival-display'
import {
  createRivalMatchSchema,
  publishBoardSchema,
  type RivalBoardDraft,
  type RivalMatchDraft,
} from './rival.schema'
import { isInRivalStartWindow } from './rival-window'
import type { RivalLevel } from './rival.types'

/** Reserva `confirmed` y futura del organizador (la lista la lee el service). */
export type NewMatchBooking = { id: string; tenantId: string; startsAt: Date; format: number }

export type NewMatchFormResult =
  { ok: true; draft: RivalMatchDraft } | { ok: false; error: string; field?: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Campos del tablón del form (`seeking`, `seekingPosition`, `whatsapp`, `whatsappConsent`) → la
 * entrada de `publishBoardSchema`. `seeking` vacío u `off` = sin tablón (`null`). La posición solo
 * viaja buscando jugadores: un valor suelto al buscar rival no rompe el form.
 */
function boardInput(raw: Record<string, unknown>): Record<string, unknown> | null {
  const seeking = text(raw.seeking)
  if (seeking === '' || seeking === 'off') return null
  const position = text(raw.seekingPosition)
  return {
    seeking,
    ...(seeking === 'players' && position !== '' ? { seekingPosition: position } : {}),
    whatsapp: text(raw.whatsapp),
    whatsappConsent: ['on', 'true'].includes(text(raw.whatsappConsent)),
  }
}

export type BoardFormResult =
  { ok: true; board: RivalBoardDraft } | { ok: false; error: string; field?: string }

/** Form de "Publicar en el tablón" (partido ya armado). Los errores llevan el nombre del campo del form. */
export function parseBoardForm(raw: Record<string, unknown>): BoardFormResult {
  const parsed = publishBoardSchema.safeParse(boardInput(raw) ?? {})
  if (parsed.success) return { ok: true, board: parsed.data }
  const issue = parsed.error.issues[0]
  const field = issue?.path[0]
  return {
    ok: false,
    error: issue?.message ?? 'Revisá los datos de la publicación.',
    ...(typeof field === 'string' ? { field } : {}),
  }
}

/**
 * Campos crudos del form (día y hora en ART) → borrador validado. La reserva se
 * vincula SOLO si es del organizador (`bookings`), del mismo complejo y a la misma
 * hora: el cliente no manda `bookingId`, así un id ajeno no existe como camino.
 */
export function parseNewMatchForm(
  raw: Record<string, unknown>,
  bookings: NewMatchBooking[],
): NewMatchFormResult {
  const date = text(raw.date)
  const time = text(raw.time)
  const startsAt = DATE_RE.test(date) && TIME_RE.test(time) ? artInstantOf(date, time) : null
  const tenantId = text(raw.tenantId)

  const booking =
    startsAt && !Number.isNaN(startsAt.getTime())
      ? bookings.find((b) => b.tenantId === tenantId && b.startsAt.getTime() === startsAt.getTime())
      : undefined

  const board = boardInput(raw)
  const parsed = createRivalMatchSchema.safeParse({
    tenantId,
    startsAt: startsAt ?? '',
    format: text(raw.format),
    capacity: text(raw.capacity) === '' ? undefined : text(raw.capacity),
    level: text(raw.level),
    ...(booking ? { bookingId: booking.id } : {}),
    courtDeclared: !booking && ['on', 'true'].includes(text(raw.courtDeclared)),
    ...(board ? { board } : {}),
  })
  if (parsed.success) return { ok: true, draft: parsed.data }
  const issue = parsed.error.issues[0]
  // Los errores del tablón vienen como `board.<campo>`: el form los pinta junto al campo.
  const field = issue?.path[0] === 'board' ? issue.path[1] : issue?.path[0]
  return {
    ok: false,
    error: issue?.message ?? 'Revisá los datos del partido.',
    ...(typeof field === 'string' ? { field } : {}),
  }
}

/** Lo que `getRepeatPrefill` saca de un partido propio: `date` ya corrida +7 días (ART). */
export type RepeatSource = {
  tenantId: string
  date: string
  time: string
  format: number
  capacity: number
  level: RivalLevel
}

/** `?desde=<id>` ya resuelto para el form: precarga SIN bloquear campos. `date` null = sin fecha. */
export type RepeatPrefill = Omit<RepeatSource, 'date'> & { date: string | null }

/**
 * Del partido de origen a la precarga: si el día +7 cae fuera de la ventana (hoy..+7, o ya
 * pasó) se precarga sin fecha y sin hora; un complejo que ya no es elegible queda sin elegir.
 */
export function resolveRepeatPrefill(
  source: RepeatSource | null,
  eligibleTenantIds: string[],
  today: string = artTodayStr(),
): RepeatPrefill | null {
  if (!source) return null
  const inWindow = source.date >= today && isInRivalStartWindow(source.date, today)
  return {
    tenantId: eligibleTenantIds.includes(source.tenantId) ? source.tenantId : '',
    date: inWindow ? source.date : null,
    time: inWindow ? source.time : '',
    format: source.format,
    capacity: source.capacity,
    level: source.level,
  }
}

/**
 * `?reserva=<id>`: precarga complejo, día, hora y formato desde una reserva de
 * `bookings` (que ya viene filtrada a las confirmadas y futuras DEL jugador). Un
 * id ajeno, mal formado o de un complejo que ya no es elegible se ignora sin error.
 */
export function resolveReservaPrefill(
  bookingId: string | undefined,
  bookings: NewMatchBooking[],
  eligibleTenantIds: string[],
): { tenantId: string; date: string; time: string; format: number } | null {
  if (!bookingId || !uuid.safeParse(bookingId).success) return null
  const b = bookings.find((x) => x.id === bookingId)
  if (!b || !eligibleTenantIds.includes(b.tenantId)) return null
  return {
    tenantId: b.tenantId,
    date: artDateOf(b.startsAt),
    time: artTimeOf(b.startsAt),
    format: b.format,
  }
}
