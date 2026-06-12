import { and, eq, notInArray, sql } from 'drizzle-orm'
import { getDb, withTenantContext } from '@/shared/db/client'
import { bookings, courts } from '@/shared/db/schema'
import { track, withSpan } from '@/shared/observability'
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
  status: string
  timezone: string
  allowOnlineBooking: boolean
  requiresDeposit: boolean
  depositPercentage: number
  bookingDurationMinutes: number[]
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
  capacity: number
  photos: string[]
  fromPriceCents: number | null
}

// 'occupied' = reserva espontánea, 'fixed' = turno fijo/abonado, 'blocked' = bloqueado por el admin
export type SlotStatus = 'free' | 'occupied' | 'fixed' | 'blocked' | 'past'

export type PublicBookingType = 'spontaneous' | 'fixed' | 'block'

export type Slot = {
  time: string
  duration: number
  status: SlotStatus
  price: number | null
}

export type PublicCourt = {
  id: string
  name: string
  surfaceType: string
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
  prices: Record<string, number>
}

export type CourtPricingData = { rules: PricingRule[] }

export type BookingRange = {
  courtId: string
  timeStartMins: number
  timeEndMins: number
  type: PublicBookingType
}

export type GenerateSlotsParams = {
  courtId: string
  pricing: CourtPricingData
  dayKey: string
  openHhmm: string
  closeHhmm: string
  closedDay: boolean
  courtBookings: BookingRange[]
  durationMins: number
  date: string       // YYYY-MM-DD
  nowDateStr: string // YYYY-MM-DD in ART
  nowMins: number    // minutes from midnight in ART
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
  durationMins: number,
): number | null {
  const slotMins = timeToMins(slotTime)
  for (const rule of rules) {
    if (!rule.days.includes(dayKey)) continue
    const from = timeToMins(rule.from)
    const to = timeToMins(rule.to)
    if (slotMins >= from && slotMins < to) {
      return rule.prices[String(durationMins)] ?? null
    }
  }
  return null
}

export function generateSlots(p: GenerateSlotsParams): Slot[] {
  if (p.closedDay) return []

  const openMins = timeToMins(p.openHhmm)
  // "00:00" means midnight = end of day (24:00)
  let closeMins = timeToMins(p.closeHhmm)
  if (closeMins === 0) closeMins = 24 * 60

  const lastStart = closeMins - p.durationMins
  const isPastDate = p.date < p.nowDateStr
  const isToday = p.date === p.nowDateStr

  const slots: Slot[] = []
  for (let start = openMins; start <= lastStart; start += p.durationMins) {
    const slotEnd = start + p.durationMins
    const timeStr = minsToTime(start)

    let status: SlotStatus
    if (isPastDate || (isToday && start < p.nowMins)) {
      status = 'past'
    } else {
      const overlapping = p.courtBookings.find(
        (b) =>
          b.courtId === p.courtId &&
          start < b.timeEndMins &&
          slotEnd > b.timeStartMins,
      )
      if (!overlapping) status = 'free'
      else if (overlapping.type === 'block') status = 'blocked'
      else if (overlapping.type === 'fixed') status = 'fixed'
      else status = 'occupied'
    }

    const price = getPriceForSlot(p.pricing.rules, p.dayKey, timeStr, p.durationMins)
    slots.push({ time: timeStr, duration: p.durationMins, status, price })
  }
  return slots
}

// ─── DB queries ───────────────────────────────────────────────────────────────

// tenants is a global table (no RLS) — no context needed (doc12 §9.3)
export async function getPublicTenant(slug: string): Promise<PublicTenant | null> {
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
    status: row.status,
    timezone: row.timezone,
    allowOnlineBooking: s.allow_online_booking ?? true,
    requiresDeposit: s.requires_deposit ?? false,
    depositPercentage: s.deposit_percentage ?? 30,
    bookingDurationMinutes: s.booking_duration_minutes ?? [60],
    bookingAdvanceDays: s.booking_advance_days ?? 6,
    amenities: (row.amenities ?? {}) as Record<string, boolean>,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
  }
}

/** Precio mínimo (centavos) entre todas las reglas/duraciones del pricing. */
function minPriceFromPricing(pricing: CourtPricingData): number | null {
  let min: number | null = null
  for (const rule of pricing.rules ?? []) {
    for (const value of Object.values(rule.prices ?? {})) {
      if (typeof value === 'number' && (min === null || value < min)) min = value
    }
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
  const closedDay = (dayHours?.closed === true) || closedDatesSet.has(dateStr)

  const durationMins = tenant.bookingDurationMinutes[0] ?? 60

  const { courtsData, bookingsData } = await withTenantContext(
    tenant.id,
    async (tx) => {
      const courtsData = await tx
        .select({
          id: courts.id,
          name: courts.name,
          surfaceType: courts.surfaceType,
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
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, tenant.id),
            sql`${bookings.date} = ${dateStr}::date`,
            notInArray(bookings.status, ['canceled_refunded', 'canceled_no_refund']),
          ),
        )

      return { courtsData, bookingsData }
    },
  )

  const bookingRanges: BookingRange[] = bookingsData.map((b) => {
    const endMins = timeToMins(b.timeEnd.slice(0, 5))
    return {
      courtId: b.courtId,
      timeStartMins: timeToMins(b.timeStart.slice(0, 5)),
      timeEndMins: endMins === 0 ? 24 * 60 : endMins,
      type: b.type,
    }
  })

  const result: PublicCourt[] = courtsData.map((court) => ({
    id: court.id,
    name: court.name,
    surfaceType: court.surfaceType,
    slots: generateSlots({
      courtId: court.id,
      pricing: court.pricing as CourtPricingData,
      dayKey,
      openHhmm: dayHours?.open ?? '08:00',
      closeHhmm: dayHours?.close ?? '23:00',
      closedDay,
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

export type WeeklyDay = { date: string; courts: PublicCourt[] }
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
  const durationMins = tenant.bookingDurationMinutes[0] ?? 60
  const closedDatesSet = new Set(tenant.closedDates)

  const { courtsData, bookingsByDate } = await withTenantContext(tenant.id, async (tx) => {
    const courtsData = await tx
      .select({
        id: courts.id,
        name: courts.name,
        surfaceType: courts.surfaceType,
        pricing: courts.pricing,
      })
      .from(courts)
      .where(and(eq(courts.tenantId, tenant.id), eq(courts.status, 'online')))

    const rows = (await tx.execute(sql`
      SELECT court_id AS "courtId", date::text AS "date",
             time_start::text AS "timeStart", time_end::text AS "timeEnd",
             type::text AS "type"
      FROM bookings
      WHERE tenant_id = ${tenant.id}::uuid
        AND date >= ${startDateStr}::date AND date <= ${endDateStr}::date
        AND status NOT IN ('canceled_refunded', 'canceled_no_refund')
    `)) as unknown as Array<{
      courtId: string
      date: string
      timeStart: string
      timeEnd: string
      type: PublicBookingType
    }>

    const bookingsByDate = new Map<string, BookingRange[]>()
    for (const r of rows) {
      const endMins = timeToMins(r.timeEnd.slice(0, 5))
      const range: BookingRange = {
        courtId: r.courtId,
        timeStartMins: timeToMins(r.timeStart.slice(0, 5)),
        timeEndMins: endMins === 0 ? 24 * 60 : endMins,
        type: r.type,
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
      slots: generateSlots({
        courtId: court.id,
        pricing: court.pricing as CourtPricingData,
        dayKey,
        openHhmm: dayHours?.open ?? '08:00',
        closeHhmm: dayHours?.close ?? '23:00',
        closedDay,
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
