// Del formulario de "Armar un partido" al borrador del service, y la precarga desde
// una reserva. Puro (sin DB): las reservas del organizador entran por parámetro.
import { artTodayStr } from '@/shared/dates/art'
import { artDateOf } from '@/shared/time/art-date'
import { uuid } from '@/shared/validation/primitives'
import { artInstantOf, artTimeOf } from './rival-display'
import {
  COURT_REQUIRED_MESSAGE,
  createRivalMatchSchema,
  publishBoardSchema,
  type RivalBoardDraft,
  type RivalMatchDraft,
} from './rival.schema'
import { isInRivalStartWindow } from './rival-window'
import type { RivalLevel } from './rival.types'

/** Reserva `confirmed` y futura del organizador (la lista la lee el service). */
export type NewMatchBooking = { id: string; tenantId: string; startsAt: Date; format: number }

/** Error por campo del form: el primero de cada uno, para pintarlos todos juntos. */
export type RivalFieldErrors = Record<string, string>

/**
 * Resultado de un form de RIVAL. `field` y `error` son el PRIMER error (junto a qué campo se
 * pinta); `fieldErrors` los trae todos. `code` deja que la vista ofrezca una salida: `no_session`
 * (sesión vencida), `rival_limit_active` y `rival_limit_requests` (el tope).
 */
export type RivalFormResult =
  | { success: true }
  | {
      success: false
      error: string
      field?: string
      fieldErrors?: RivalFieldErrors
      code?: string
    }

/** Qué necesita el que arma: lo que decide capacidad, cupo de fuera de la app y si sale al tablón. */
const NEW_MATCH_INTENTS = ['players', 'rival', 'group'] as const
export type NewMatchIntent = (typeof NEW_MATCH_INTENTS)[number]

/** `?necesito=jugadores|rival` -> el paso 1 preseleccionado. Cualquier otro valor se ignora. */
export function intentFromNecesito(necesito: string | undefined): NewMatchIntent | null {
  if (necesito === 'jugadores') return 'players'
  if (necesito === 'rival') return 'rival'
  return null
}

export type NewMatchFormResult =
  | { ok: true; draft: RivalMatchDraft; board: RivalBoardDraft | null }
  | { ok: false; error: string; field?: string; fieldErrors: RivalFieldErrors }

/** Orden del form de armar: de él sale el primer error (`field`/`error`). */
const FIELD_ORDER = [
  'intent',
  'missing',
  'tenantId',
  'startsAt',
  'format',
  'capacity',
  'level',
  'courtDeclared',
  'whatsapp',
  'whatsappConsent',
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Issues de Zod → el primer mensaje de cada campo (`path[0]`). */
export function collectFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): RivalFieldErrors {
  const out: RivalFieldErrors = {}
  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field === 'string') out[field] ??= issue.message
  }
  return out
}

/** El primer campo con error según `order` (los que no figuran, después, en el orden en que llegaron). */
function firstFieldError(
  fieldErrors: RivalFieldErrors,
  order: readonly string[],
): { field?: string; error?: string } {
  const field = [...order, ...Object.keys(fieldErrors)].find((f) => fieldErrors[f] !== undefined)
  return field ? { field, error: fieldErrors[field] } : {}
}

/**
 * `players.phone` a partir de los dígitos de `wa.me` (549 + área + abonado), con el formato que ya
 * guarda el perfil ("+54 " + nacional, sin el 9 de móvil): la precarga lo vuelve a normalizar.
 */
export function playerPhoneOf(whatsappDigits: string): string {
  return `+54 ${whatsappDigits.slice(3)}`
}

/**
 * Campos de "Publicar en el tablón" (`seeking`, `seekingPosition`, `whatsapp`, `whatsappConsent`) →
 * la entrada de `publishBoardSchema`. `seeking` vacío = sin tablón (`null`). La posición solo
 * viaja buscando jugadores: un valor suelto al buscar rival no rompe el form.
 */
function boardInput(raw: Record<string, unknown>): Record<string, unknown> | null {
  const seeking = text(raw.seeking)
  if (seeking === '') return null
  const position = text(raw.seekingPosition)
  return {
    seeking,
    ...(seeking === 'players' && position !== '' ? { seekingPosition: position } : {}),
    whatsapp: text(raw.whatsapp),
    whatsappConsent: ['on', 'true'].includes(text(raw.whatsappConsent)),
    savePhone: ['on', 'true'].includes(text(raw.savePhone)),
  }
}

export type BoardFormResult =
  | { ok: true; board: RivalBoardDraft }
  | { ok: false; error: string; field?: string; fieldErrors: RivalFieldErrors }

/** Form de "Publicar en el tablón" (partido ya armado). Los errores llevan el nombre del campo del form. */
export function parseBoardForm(raw: Record<string, unknown>): BoardFormResult {
  const parsed = publishBoardSchema.safeParse(boardInput(raw) ?? {})
  if (parsed.success) return { ok: true, board: parsed.data }
  const fieldErrors = collectFieldErrors(parsed.error.issues)
  const first = firstFieldError(fieldErrors, [])
  return {
    ok: false,
    error: first.error ?? 'Revisá los datos de la publicación.',
    ...(first.field ? { field: first.field } : {}),
    fieldErrors,
  }
}

/**
 * Lo que sale del paso 1 ("¿Qué necesitás?"): cupo y lugares de fuera de la app.
 * - Me faltan jugadores: juegan formato x 2; `offlineCount` = lugares ya cubiertos sin contar al
 *   organizador (que entra solo como confirmado): capacidad - faltan - 1.
 * - Busco rival: el equipo está completo (cupo = formato; el organizador y el resto, afuera).
 * - Solo para mi grupo: como siempre, sin lugares de fuera de la app.
 */
function intentCapacity(
  intent: NewMatchIntent | null,
  raw: Record<string, unknown>,
): { capacity: string | undefined; offlineCount: number; error?: string } {
  const format = Number(text(raw.format))
  const formatOk = Number.isInteger(format) && format >= 4 && format <= 11
  const typed = text(raw.capacity) === '' ? undefined : text(raw.capacity)
  if (!formatOk || intent === null || intent === 'group') {
    return { capacity: typed, offlineCount: 0 }
  }
  if (intent === 'rival') return { capacity: String(format), offlineCount: format - 1 }
  const capacity = format * 2
  const missing = Number(text(raw.missing))
  if (!Number.isInteger(missing) || missing < 1 || missing >= capacity) {
    return { capacity: String(capacity), offlineCount: 0, error: 'Elegí cuántos te faltan.' }
  }
  return { capacity: String(capacity), offlineCount: capacity - missing - 1 }
}

/**
 * Campos crudos del form (día y hora en ART) -> borrador validado, más la publicación si la
 * intención sale al tablón. La reserva se vincula SOLO si es del organizador (`bookings`), del
 * mismo complejo y a la misma hora: el cliente no manda `bookingId`, así un id ajeno no existe
 * como camino.
 */
export function parseNewMatchForm(
  raw: Record<string, unknown>,
  bookings: NewMatchBooking[],
): NewMatchFormResult {
  const date = text(raw.date)
  const time = text(raw.time)
  const startsAt = DATE_RE.test(date) && TIME_RE.test(time) ? artInstantOf(date, time) : null
  const tenantId = text(raw.tenantId)
  const intent = NEW_MATCH_INTENTS.find((i) => i === text(raw.intent)) ?? null
  const slots = intentCapacity(intent, raw)

  const booking =
    startsAt && !Number.isNaN(startsAt.getTime())
      ? bookings.find((b) => b.tenantId === tenantId && b.startsAt.getTime() === startsAt.getTime())
      : undefined

  const parsed = createRivalMatchSchema.safeParse({
    tenantId,
    startsAt: startsAt ?? '',
    format: text(raw.format),
    capacity: slots.capacity,
    level: text(raw.level),
    ...(booking ? { bookingId: booking.id } : {}),
    courtDeclared: !booking && ['on', 'true'].includes(text(raw.courtDeclared)),
    offlineCount: slots.offlineCount,
  })

  const fieldErrors: RivalFieldErrors = parsed.success
    ? {}
    : collectFieldErrors(parsed.error.issues)
  if (intent === null) fieldErrors.intent = 'Elegí qué necesitás.'
  if (slots.error) fieldErrors.missing ??= slots.error
  if (time === '') fieldErrors.startsAt = 'Elegí la hora.'
  // El superRefine del objeto no corre si falla otro campo: la cancha se chequea acá para que
  // el error de todos los campos llegue en un solo envío.
  if (!booking && !['on', 'true'].includes(text(raw.courtDeclared))) {
    fieldErrors.courtDeclared ??= COURT_REQUIRED_MESSAGE
  }

  // Me faltan jugadores y Busco rival salen al tablón al crear: el WhatsApp viaja en el mismo form.
  let board: RivalBoardDraft | null = null
  if (intent === 'players' || intent === 'rival') {
    const boardParsed = parseBoardForm({
      ...raw,
      seeking: intent,
      seekingPosition: ['on', 'true'].includes(text(raw.seekingGoalkeeper)) ? 'goalkeeper' : 'any',
    })
    if (boardParsed.ok) board = boardParsed.board
    else Object.assign(fieldErrors, { ...boardParsed.fieldErrors, ...fieldErrors })
  }

  if (parsed.success && Object.keys(fieldErrors).length === 0) {
    return { ok: true, draft: parsed.data, board }
  }
  const first = firstFieldError(fieldErrors, FIELD_ORDER)
  return {
    ok: false,
    error: first.error ?? 'Revisá los datos del partido.',
    ...(first.field ? { field: first.field } : {}),
    fieldErrors,
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
