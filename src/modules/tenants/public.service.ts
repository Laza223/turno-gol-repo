import { cache } from 'react'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { getDb, withTenantContext } from '@/shared/db/client'
import { bookings, courts, tenantSubscriptions } from '@/shared/db/schema'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { track, withSpan } from '@/shared/observability'
import { effectiveCloseMins, normalizeRangeToOpenDay } from '@/shared/time/operating-day'
import { holdExpiresAtIso } from '@/lib/booking/hold'
import { publicBookingAdvanceDays } from './tenant.lifecycle'
import type { OpeningHours, TenantSettings } from './tenant.types'

// ─── Public types ─────────────────────────────────────────────────────────────

export type PublicTenant = {
  id: string
  slug: string
  name: string
  description: string | null
  logoUrl: string | null
  coverUrl: string | null
  address: string
  city: string
  province: string
  phone: string
  whatsapp: string | null
  openingHours: OpeningHours
  closedDates: string[]
  closesNextDay: boolean
  status: string
  /**
   * `tenant_subscriptions.current_period_end` — hasta cuándo llega el período
   * ya pagado. Se lee SOLO cuando `status === 'canceled'`; en cualquier otro
   * estado es `null` porque no cambia ninguna decisión y no vale la query.
   * Lo consume `isPublicPortalOpen` (tenant.lifecycle.ts).
   */
  canceledPeriodEnd: Date | null
  timezone: string
  allowOnlineBooking: boolean
  requiresDeposit: boolean
  depositPercentage: number
  // Métodos de pago presencial que el complejo declara aceptar (settings).
  acceptsCash: boolean
  acceptsTransfer: boolean
  /**
   * Anticipación EFECTIVA, no la cruda de `settings`: un complejo `canceled`
   * la trae recortada para no vender turnos posteriores a su período pago
   * (`publicBookingAdvanceDays`). Todas las superficies públicas leen de acá
   * —la grilla, `/api/public/availability` y su variante semanal—, así que el
   * tope se aplica una vez y vale para todas.
   */
  bookingAdvanceDays: number
  // Interfaz pública estilo ATC: amenities + coordenadas (ya en la fila tenants).
  amenities: Record<string, boolean>
  latitude: number | null
  longitude: number | null
}

// Tarjeta pública de cancha para el perfil del complejo.
export type PublicCourtCard = {
  id: string
  name: string
  surfaceType: string
  isCovered: boolean
  hasLighting: boolean
  format: number
  capacity: number
  photos: string[]
  fromPriceCents: number | null
}

/**
 * 'occupied' = reserva espontánea vendida · 'fixed' = turno fijo/abonado ·
 * 'blocked' = bloqueado por el admin o poseído por un torneo · 'past' = ya pasó.
 *
 * **'held' = otro jugador está pagando la seña AHORA** (decisión v2 D1). Antes
 * no existía: un `pending_payment` ajeno caía en el `else` final y salía
 * `'occupied'`, o sea **idéntico a vendido**. Viernes 20:30, el jugador B ve
 * "ocupada" y se va a otro complejo; seis minutos después el hold de A expira y
 * el slot vuelve a estar libre, pero B ya no está. Eso es inventario que se
 * pierde por una pantalla que no dice la verdad — lo contrario de lo que pide
 * D1 ("la ansiedad se responde con estados explícitos, no con inventario
 * congelado").
 *
 * Un slot `held` **no es pisable**: sigue ocupando el exclusion constraint.
 */
export type SlotStatus = 'free' | 'occupied' | 'held' | 'fixed' | 'blocked' | 'past'

type PublicBookingType = 'spontaneous' | 'fixed' | 'block' | 'tournament'

export type Slot = {
  time: string
  duration: number
  status: SlotStatus
  price: number | null
  /**
   * Solo en `held`: instante ISO en que el hold deja de retener la cancha.
   *
   * Va **absoluto y no "segundos restantes"** a propósito. La respuesta de
   * `/api/public/availability` se cachea 30s en el CDN (`s-maxage=30`,
   * `stale-while-revalidate=60`): un relativo servido desde caché llega corrido
   * por hasta 90 segundos sobre una ventana de 360, y el jugador vuelve a
   * confiar en un margen que no existe — el mismo modo de falla de caza-bugs
   * #12. Un instante absoluto sale bien de la caché siempre.
   */
  heldUntil?: string
}

type PublicCourt = {
  id: string
  name: string
  surfaceType: string
  isCovered: boolean
  hasLighting: boolean
  slots: Slot[]
}

export type AvailabilityResponse = {
  date: string
  courts: PublicCourt[]
}

// ─── Internal types ───────────────────────────────────────────────────────────

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

type PricingRule = {
  days: string[]
  from: string
  to: string
  price: number
}

export type CourtPricingData = { rules: PricingRule[] }

type BookingRange = {
  courtId: string
  timeStartMins: number
  timeEndMins: number
  type: PublicBookingType
  /** `pending_payment` = hold vivo. El resto de los estados ya vienen filtrados. */
  status?: string
  /** Ancla del vencimiento del hold (`created_at`); solo importa si es un hold. */
  createdAt?: Date | string
}

export type GenerateSlotsParams = {
  courtId: string
  pricing: CourtPricingData
  dayKey: string
  openHhmm: string
  closeHhmm: string
  closedDay: boolean
  // Día operativo: cierre post-medianoche → slots 00:00, 01:00… al final.
  closesNextDay?: boolean
  courtBookings: BookingRange[]
  durationMins: number
  date: string // YYYY-MM-DD
  nowDateStr: string // YYYY-MM-DD in ART
  nowMins: number // minutes from midnight in ART
}

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function getPriceForSlot(
  rules: PricingRule[],
  dayKey: string,
  slotTime: string,
): number | null {
  const slotMins = timeToMins(slotTime)
  for (const rule of rules) {
    if (!rule.days.includes(dayKey)) continue
    const from = timeToMins(rule.from)
    // caza-bugs #11: '00:00' de cierre significa medianoche (fin del día), no
    // el minuto 0 — mismo tratamiento que court.service.ts/pricing-grid.ts.
    // Sin esto, ninguna franja que cierre a medianoche matcheaba NUNCA
    // (slotMins < 0 es imposible) y esos slots quedaban con precio null.
    const to = rule.to === '00:00' ? 24 * 60 : timeToMins(rule.to)
    if (slotMins >= from && slotMins < to) {
      return rule.price ?? null
    }
  }
  return null
}

export function generateSlots(p: GenerateSlotsParams): Slot[] {
  if (p.closedDay) return []

  const closesNextDay = p.closesNextDay ?? false
  const openMins = timeToMins(p.openHhmm)
  // Día operativo: "00:00" = medianoche (24:00); con closesNextDay un cierre
  // post-medianoche corre a 25:00/26:00 y las madrugadas quedan al final.
  const closeMins = effectiveCloseMins(p.openHhmm, p.closeHhmm, closesNextDay)
  // Reservas de madrugada (00:00, 01:00) se guardan con hora de pared chica;
  // las llevamos al eje continuo (≥1440) para que solapen con sus slots.
  const courtBookings = p.courtBookings.map((b) => {
    const n = normalizeRangeToOpenDay(b.timeStartMins, b.timeEndMins, openMins, closesNextDay)
    return { ...b, timeStartMins: n.startMins, timeEndMins: n.endMins }
  })

  const lastStart = closeMins - p.durationMins
  const isPastDate = p.date < p.nowDateStr
  const isToday = p.date === p.nowDateStr

  const slots: Slot[] = []
  for (let start = openMins; start <= lastStart; start += p.durationMins) {
    const slotEnd = start + p.durationMins
    const timeStr = minsToTime(start)

    let status: SlotStatus
    let heldUntil: string | undefined
    // start está en el eje continuo: un slot de madrugada (start ≥ 1440) supera
    // a nowMins de hoy, así que NO se marca pasado aunque su hora de pared ya
    // pasó (ocurre físicamente mañana, mismo día operativo).
    if (isPastDate || (isToday && start < p.nowMins)) {
      status = 'past'
    } else {
      const overlapping = courtBookings.find(
        (b) => b.courtId === p.courtId && start < b.timeEndMins && slotEnd > b.timeStartMins,
      )
      if (!overlapping) status = 'free'
      // El torneo posee la hora: para el jugador no es reservable, igual que un
      // bloqueo del admin. Explícito y no por el else, que daría 'occupied'.
      else if (overlapping.type === 'block' || overlapping.type === 'tournament') status = 'blocked'
      else if (overlapping.type === 'fixed') status = 'fixed'
      // Alguien está pagando la seña AHORA (D1). Antes esto caía en el else y
      // salía 'occupied' — indistinguible de vendido, que es el agujero que
      // quema inventario. No se compara contra el reloj acá: si el hold ya
      // venció y el worker todavía no lo barrió, la fila SIGUE bloqueando el
      // exclusion constraint, así que decir "libre" sería la misma mentira al
      // revés. Se manda el instante y el cliente dice "se está liberando".
      else if (overlapping.status === 'pending_payment' && overlapping.createdAt) {
        status = 'held'
        heldUntil = holdExpiresAtIso(overlapping.createdAt)
      } else status = 'occupied'
    }

    const price = getPriceForSlot(p.pricing.rules, p.dayKey, timeStr)
    slots.push({
      time: timeStr,
      duration: p.durationMins,
      status,
      price,
      ...(heldUntil && { heldUntil }),
    })
  }
  return slots
}

// ─── DB queries ───────────────────────────────────────────────────────────────

/**
 * Slugs de los complejos públicos más activos (reservas creadas en los últimos
 * 60 días) para pre-generar sus perfiles en build (ISR de /[slug]). LEFT JOIN:
 * un complejo visible sin reservas recientes igual califica si sobran lugares.
 * Si bookings está vedada por RLS para el rol del build, los counts dan 0 y el
 * orden degrada a alfabético — sigue siendo un proxy válido de "visibles".
 * Fail-open: cualquier error (p. ej. build sin DB) devuelve [] y los perfiles
 * se generan on-demand.
 */
export async function listTopPublicTenantSlugs(limit = 50): Promise<string[]> {
  try {
    const db = getDb()
    const rows = await db.execute(sql`
      SELECT t.slug
      FROM tenants t
      LEFT JOIN bookings b
        ON b.tenant_id = t.id
       AND b.created_at >= now() - interval '60 days'
      WHERE t.status IN ('active', 'trialing')
        AND t.marketplace_visible = true
      GROUP BY t.id
      ORDER BY count(b.id) DESC, t.name ASC
      LIMIT ${limit}
    `)
    return (rows as unknown as { slug: string }[]).map((r) => r.slug)
  } catch {
    return []
  }
}

// tenants is a global table (no RLS) — no context needed (doc12 §9.3)
//
// Envuelto en `cache()` de React: dentro de un mismo render el slug se resuelve
// una sola vez por más que lo pidan el layout, `generateMetadata` y la page (que
// ya lo pedían dos veces antes de que existiera el layout). Todos los callers son
// request-scoped (pages y route handlers), así que no hay uso fuera de un render.
export const getPublicTenant = cache(_getPublicTenant)

async function _getPublicTenant(slug: string): Promise<PublicTenant | null> {
  const db = getDb()
  const row = await db.query.tenants.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.slug, slug),
    columns: {
      id: true,
      slug: true,
      name: true,
      description: true,
      logoUrl: true,
      coverUrl: true,
      address: true,
      city: true,
      province: true,
      phone: true,
      whatsapp: true,
      openingHours: true,
      closedDates: true,
      closesNextDay: true,
      status: true,
      timezone: true,
      settings: true,
      amenities: true,
      latitude: true,
      longitude: true,
      // NEVER: email, mpAccessToken, mpRefreshToken, mpUserId, mpPublicKey
    },
  })

  if (!row) return null

  const s = row.settings as TenantSettings
  // Segunda query SOLO en la baja voluntaria: `isPublicPortalOpen` y
  // `publicBookingAdvanceDays` necesitan el fin del período pago únicamente
  // cuando el estado es `canceled`. Así el resto de las visitas públicas (o
  // sea, casi todas) no paga una transacción extra. `tenant_subscriptions`
  // está aislada por RLS, de ahí el `withTenantContext` — mismo camino que ya
  // usan `getPublicCourtCards` y el layout admin.
  const canceledPeriodEnd =
    row.status === 'canceled'
      ? await withTenantContext(row.id, async (tx) =>
          tx
            .select({ currentPeriodEnd: tenantSubscriptions.currentPeriodEnd })
            .from(tenantSubscriptions)
            .where(eq(tenantSubscriptions.tenantId, row.id))
            .limit(1)
            .then((r) => r[0]?.currentPeriodEnd ?? null),
        )
      : null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    address: row.address,
    city: row.city,
    province: row.province,
    phone: row.phone,
    whatsapp: row.whatsapp,
    openingHours: row.openingHours as OpeningHours,
    closedDates: (row.closedDates ?? []) as string[],
    closesNextDay: row.closesNextDay ?? false,
    status: row.status,
    canceledPeriodEnd,
    timezone: row.timezone,
    allowOnlineBooking: s.allow_online_booking ?? true,
    requiresDeposit: s.requires_deposit ?? false,
    depositPercentage: s.deposit_percentage ?? 30,
    acceptsCash: s.accepts_cash ?? true,
    acceptsTransfer: s.accepts_transfer ?? true,
    bookingAdvanceDays: publicBookingAdvanceDays(
      s.booking_advance_days ?? 6,
      row.status,
      canceledPeriodEnd,
    ),
    amenities: (row.amenities ?? {}) as Record<string, boolean>,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
  }
}

/** Precio mínimo (centavos) entre todas las reglas/duraciones del pricing. */
function minPriceFromPricing(pricing: CourtPricingData): number | null {
  let min: number | null = null
  for (const rule of pricing.rules ?? []) {
    const value = rule.price
    if (typeof value === 'number' && (min === null || value < min)) min = value
  }
  return min
}

/**
 * Tarjetas de canchas del complejo (perfil público). Lee courts dentro de
 * withTenantContext (RLS-safe, igual que la grilla de disponibilidad).
 */
export async function getPublicCourtCards(tenant: PublicTenant): Promise<PublicCourtCard[]> {
  const rows = await withTenantContext(tenant.id, async (tx) =>
    tx
      .select({
        id: courts.id,
        name: courts.name,
        surfaceType: courts.surfaceType,
        isCovered: courts.isCovered,
        hasLighting: courts.hasLighting,
        format: courts.format,
        capacity: courts.capacity,
        photos: courts.photos,
        pricing: courts.pricing,
      })
      .from(courts)
      .where(and(eq(courts.tenantId, tenant.id), eq(courts.status, 'online'))),
  )
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    surfaceType: c.surfaceType,
    isCovered: c.isCovered,
    hasLighting: c.hasLighting,
    format: c.format,
    capacity: c.capacity,
    photos: (c.photos ?? []) as string[],
    fromPriceCents: minPriceFromPricing(c.pricing as CourtPricingData),
  }))
}

export async function getPublicAvailability(
  tenant: PublicTenant,
  dateStr: string, // YYYY-MM-DD
): Promise<AvailabilityResponse> {
  return withSpan('availability.public', 'http.server.availability', () =>
    getPublicAvailabilityImpl(tenant, dateStr),
  )
}

async function getPublicAvailabilityImpl(
  tenant: PublicTenant,
  dateStr: string, // YYYY-MM-DD
): Promise<AvailabilityResponse> {
  track.availability('availability.public.query', { tenantId: tenant.id, date: dateStr })
  // Current time in ART. Argentina = UTC-3, no DST.
  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const nowDateStr = artNow.toISOString().slice(0, 10)
  const nowMins = artNow.getUTCHours() * 60 + artNow.getUTCMinutes()

  const [y, mo, d] = dateStr.split('-').map(Number)
  const targetUtc = new Date(Date.UTC(y, mo - 1, d))
  const dayKey = DAY_KEYS[targetUtc.getUTCDay()]

  const dayHours = tenant.openingHours[dayKey]
  const closedDatesSet = new Set(tenant.closedDates)
  const closedDay = dayHours?.closed === true || closedDatesSet.has(dateStr)

  const durationMins = SLOT_DURATION_MINUTES

  const { courtsData, bookingsData } = await withTenantContext(tenant.id, async (tx) => {
    const courtsData = await tx
      .select({
        id: courts.id,
        name: courts.name,
        surfaceType: courts.surfaceType,
        isCovered: courts.isCovered,
        hasLighting: courts.hasLighting,
        pricing: courts.pricing,
      })
      .from(courts)
      .where(and(eq(courts.tenantId, tenant.id), eq(courts.status, 'online')))

    const bookingsData = await tx
      .select({
        courtId: bookings.courtId,
        timeStart: bookings.timeStart,
        timeEnd: bookings.timeEnd,
        type: bookings.type,
        // status + createdAt entran para distinguir un hold vivo de una venta:
        // sin ellos los dos se ven igual y el slot sale 'occupied'.
        status: bookings.status,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenant.id),
          sql`${bookings.date} = ${dateStr}::date`,
          notInArray(bookings.status, ['canceled_refunded', 'canceled_no_refund', 'expired']),
        ),
      )

    return { courtsData, bookingsData }
  })

  const bookingRanges: BookingRange[] = bookingsData.map((b) => {
    const endMins = timeToMins(b.timeEnd.slice(0, 5))
    return {
      courtId: b.courtId,
      timeStartMins: timeToMins(b.timeStart.slice(0, 5)),
      timeEndMins: endMins === 0 ? 24 * 60 : endMins,
      type: b.type,
      status: b.status,
      createdAt: b.createdAt,
    }
  })

  const result: PublicCourt[] = courtsData.map((court) => ({
    id: court.id,
    name: court.name,
    surfaceType: court.surfaceType,
    isCovered: court.isCovered,
    hasLighting: court.hasLighting,
    slots: generateSlots({
      courtId: court.id,
      pricing: court.pricing as CourtPricingData,
      dayKey,
      openHhmm: dayHours?.open ?? '08:00',
      closeHhmm: dayHours?.close ?? '23:00',
      closedDay,
      closesNextDay: tenant.closesNextDay,
      courtBookings: bookingRanges,
      durationMins,
      date: dateStr,
      nowDateStr,
      nowMins,
    }),
  }))

  return { date: dateStr, courts: result }
}

// ─── Weekly availability ──────────────────────────────────────────────────────

type WeeklyDay = { date: string; courts: PublicCourt[] }
export type WeeklyAvailabilityResponse = { startDate: string; days: WeeklyDay[] }

function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export async function getPublicWeeklyAvailability(
  tenant: PublicTenant,
  startDateStr: string,
): Promise<WeeklyAvailabilityResponse> {
  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const nowDateStr = artNow.toISOString().slice(0, 10)
  const nowMins = artNow.getUTCHours() * 60 + artNow.getUTCMinutes()

  const dates = Array.from({ length: 7 }, (_, i) => addDaysStr(startDateStr, i))
  const endDateStr = dates[dates.length - 1]!
  const durationMins = SLOT_DURATION_MINUTES
  const closedDatesSet = new Set(tenant.closedDates)

  const { courtsData, bookingsByDate } = await withTenantContext(tenant.id, async (tx) => {
    const courtsData = await tx
      .select({
        id: courts.id,
        name: courts.name,
        surfaceType: courts.surfaceType,
        isCovered: courts.isCovered,
        hasLighting: courts.hasLighting,
        pricing: courts.pricing,
      })
      .from(courts)
      .where(and(eq(courts.tenantId, tenant.id), eq(courts.status, 'online')))

    // B8: `created_at` sale como STRING por `tx.execute`, no como Date — el
    // tipo lo dice para que nadie le haga `.getTime()` directo (tabla en
    // `src/shared/db/client.ts`). `holdExpiresAtIso` acepta las dos formas.
    const rows = await tx.execute<{
      courtId: string
      date: string
      timeStart: string
      timeEnd: string
      type: PublicBookingType
      status: string
      createdAt: string
    }>(sql`
      SELECT court_id AS "courtId", date::text AS "date",
             time_start::text AS "timeStart", time_end::text AS "timeEnd",
             type::text AS "type", status::text AS "status",
             created_at AS "createdAt"
      FROM bookings
      WHERE tenant_id = ${tenant.id}::uuid
        AND date >= ${startDateStr}::date AND date <= ${endDateStr}::date
        AND status NOT IN ('canceled_refunded', 'canceled_no_refund', 'expired')
    `)

    const bookingsByDate = new Map<string, BookingRange[]>()
    for (const r of rows) {
      const endMins = timeToMins(r.timeEnd.slice(0, 5))
      const range: BookingRange = {
        courtId: r.courtId,
        timeStartMins: timeToMins(r.timeStart.slice(0, 5)),
        timeEndMins: endMins === 0 ? 24 * 60 : endMins,
        type: r.type,
        status: r.status,
        createdAt: r.createdAt,
      }
      const key = r.date.slice(0, 10)
      const list = bookingsByDate.get(key) ?? []
      list.push(range)
      bookingsByDate.set(key, list)
    }
    return { courtsData, bookingsByDate }
  })

  const days: WeeklyDay[] = dates.map((dateStr) => {
    const [y, mo, d] = dateStr.split('-').map(Number)
    const targetUtc = new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1))
    const dayKey = DAY_KEYS[targetUtc.getUTCDay()]!
    const dayHours = tenant.openingHours[dayKey as keyof OpeningHours]
    const closedDay = dayHours?.closed === true || closedDatesSet.has(dateStr)
    const courtBookings = bookingsByDate.get(dateStr) ?? []

    const dayCourts: PublicCourt[] = courtsData.map((court) => ({
      id: court.id,
      name: court.name,
      surfaceType: court.surfaceType,
      isCovered: court.isCovered,
      hasLighting: court.hasLighting,
      slots: generateSlots({
        courtId: court.id,
        pricing: court.pricing as CourtPricingData,
        dayKey,
        openHhmm: dayHours?.open ?? '08:00',
        closeHhmm: dayHours?.close ?? '23:00',
        closedDay,
        closesNextDay: tenant.closesNextDay,
        courtBookings,
        durationMins,
        date: dateStr,
        nowDateStr,
        nowMins,
      }),
    }))
    return { date: dateStr, courts: dayCourts }
  })

  return { startDate: startDateStr, days }
}
