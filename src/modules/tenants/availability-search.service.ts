import { inArray, sql } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { readThroughAvailSearch } from '@/shared/cache/slots-cache'
import { track, withSpan } from '@/shared/observability'
import { generateSlots } from './public.service'
import { VISIBLE_TENANT_STATUSES } from './search.service'
import type { OpeningHours, TenantSettings } from './tenant.types'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { addDays } from '@/shared/dates/art'
import { dateStr, hhmm } from '@/shared/validation/primitives'

/**
 * Cross-tenant availability search: which complejos have at least one free
 * court at a requested date+time. Pure slot semantics are delegated to
 * generateSlots() (the same logic that renders the public profile grid) so the
 * search can never disagree with what the player sees on the tenant page.
 */

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type TenantSlotConfig = {
  openingHours: OpeningHours
  closedDates: string[]
  durationMins: number
  bookingAdvanceDays: number
}

export type NowRef = { nowDateStr: string; nowMins: number }

/**
 * True when `time` is a real, free-by-schedule slot of the tenant grid on
 * `date`: open that day, not in closed_dates, aligned to `open + k·duration`,
 * ending before close, not already started, and within the tenant's
 * booking-advance window. Court occupancy is NOT considered here — that is the
 * SQL pass.
 */
export function tenantMatchesRequestedSlot(
  cfg: TenantSlotConfig,
  date: string, // YYYY-MM-DD
  time: string, // HH:MM
  now: NowRef,
): boolean {
  // Same window rule as /api/public/availability: beyond the tenant's advance
  // window its grid is not bookable, so it must not match a search either.
  if (date > addDays(now.nowDateStr, cfg.bookingAdvanceDays)) return false

  const [y, mo, d] = date.split('-').map(Number)
  const dayKey = DAY_KEYS[new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1)).getUTCDay()]!
  const dayHours = cfg.openingHours[dayKey as keyof OpeningHours]
  const closedDay = dayHours?.closed === true || cfg.closedDates.includes(date)

  // Dummy pricing + no bookings: we only need schedule/grid/past semantics.
  const slots = generateSlots({
    courtId: 'probe',
    pricing: { rules: [] },
    dayKey,
    openHhmm: dayHours?.open ?? '08:00',
    closeHhmm: dayHours?.close ?? '23:00',
    closedDay,
    courtBookings: [],
    durationMins: cfg.durationMins,
    date,
    nowDateStr: now.nowDateStr,
    nowMins: now.nowMins,
  })

  return slots.some((s) => s.time === time && s.status === 'free')
}

/**
 * Valida el par fecha+hora que llega por URL a /explorar. Devuelve null (filtro
 * apagado) si falta alguno o si no validan — params de URL son input de usuario
 * y un link viejo/malformado no debe romper la página.
 */
export function parseAvailabilitySearchParams(sp: {
  date?: string
  time?: string
}): { date: string; time: string } | null {
  if (!sp.date || !sp.time) return null
  const date = dateStr.safeParse(sp.date)
  const time = hhmm.safeParse(sp.time)
  if (!date.success || !time.success) return null
  return { date: date.data, time: time.data }
}

// ─── Cross-tenant query ───────────────────────────────────────────────────────

export type AvailabilitySearchParams = {
  date: string // YYYY-MM-DD (validated upstream)
  time: string // HH:MM (validated upstream)
  formats?: number[] // court format (Fútbol N): 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// Slot-end as a Postgres time. A slot may end exactly at midnight; Postgres
// accepts '24:00' as the max time value, which keeps the overlap comparison
// monotonic (unlike wrapping to '00:00').
function slotEndTime(mins: number): string {
  if (mins >= 24 * 60) return '24:00'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Tenant ids (sorted) with at least one online court — optionally restricted to
 * `formats` — free at `date`+`time`. Results are cached in Upstash for 30s and
 * invalidated by every booking mutation via invalidateCourtDateSlots.
 *
 * Two DB round-trips regardless of tenant count (never one per tenant):
 *  1. the global `tenants` table → schedule candidates, filtered in TS with the
 *     same pure slot semantics as the public profile grid;
 *  2. one cross-tenant anti-join over courts/bookings for the candidates.
 */
export async function findAvailableTenantIds(
  params: AvailabilitySearchParams,
): Promise<string[]> {
  return withSpan('search.availability', 'db.query.search', async () => {
    const { tenantIds } = await readThroughAvailSearch(
      params.date,
      params.time,
      params.formats,
      () => loadAvailableTenantIds(params),
    )
    return tenantIds
  })
}

async function loadAvailableTenantIds({
  date,
  time,
  formats,
}: AvailabilitySearchParams): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: tenants.id,
      openingHours: tenants.openingHours,
      closedDates: tenants.closedDates,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(inArray(tenants.status, VISIBLE_TENANT_STATUSES as never))

  // Current time in ART. Argentina = UTC-3, no DST.
  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const now = {
    nowDateStr: artNow.toISOString().slice(0, 10),
    nowMins: artNow.getUTCHours() * 60 + artNow.getUTCMinutes(),
  }

  const startMins = timeToMins(time)
  const candidates: Array<{ id: string; timeEnd: string }> = []
  for (const row of rows) {
    const s = row.settings as TenantSettings
    const durationMins = SLOT_DURATION_MINUTES
    const matches = tenantMatchesRequestedSlot(
      {
        openingHours: row.openingHours as OpeningHours,
        closedDates: (row.closedDates ?? []) as string[],
        durationMins,
        bookingAdvanceDays: s.booking_advance_days ?? 6,
      },
      date,
      time,
      now,
    )
    if (matches) {
      candidates.push({ id: row.id, timeEnd: slotEndTime(startMins + durationMins) })
    }
  }
  if (candidates.length === 0) return []

  // Cross-tenant read over courts/bookings WITHOUT tenant context: same caveat
  // as the pg-boss workers (BK-01) — today the connection owns the tables so
  // RLS does not bind; under FORCE RLS + a non-bypass role this returns 0 rows
  // (fails closed, no leak). Only tenant_id is selected, never booking data.
  // The slot window length is per-tenant (60' vs 120' grids), hence the unnest
  // of (tenant_id, time_end) pairs instead of a single shared window.
  const idList = sql.join(candidates.map((c) => sql`${c.id}::uuid`), sql`, `)
  const endList = sql.join(candidates.map((c) => sql`${c.timeEnd}::time`), sql`, `)
  const formatCond = formats?.length
    ? sql` AND c.format IN (${sql.join(formats.map((f) => sql`${f}`), sql`, `)})`
    : sql``

  const result = await db.execute(sql`
    SELECT DISTINCT c.tenant_id AS tenant_id
    FROM unnest(ARRAY[${idList}], ARRAY[${endList}]) AS cand(tenant_id, time_end)
    JOIN courts c
      ON c.tenant_id = cand.tenant_id
     AND c.status = 'online'${formatCond}
    WHERE NOT EXISTS (
      SELECT 1
      FROM bookings b
      WHERE b.tenant_id = c.tenant_id
        AND b.court_id = c.id
        AND b.date = ${date}::date
        AND b.status IN ('pending_payment', 'confirmed')
        AND b.time_start < cand.time_end
        -- legacy guard: a midnight slot-end may be stored as 00:00
        AND (CASE WHEN b.time_end = '00:00'::time THEN '24:00'::time ELSE b.time_end END) > ${time}::time
    )
  `)

  const ids = (result as unknown as Array<{ tenant_id: string }>)
    .map((r) => r.tenant_id)
    .sort()

  track.search('search.availability.query', {
    date,
    time,
    formats: formats?.length ? formats.join(',') : undefined,
    candidates: candidates.length,
    results: ids.length,
  })
  return ids
}

// ─── Píldoras de turnos libres por tenant (cards de /explorar) ───────────────

/** Turno libre listo para linkear a /[slug]/reservar (court+date+time+dur). */
export type SlotPill = { time: string; courtId: string; durationMins: number }

export type CourtOccupancy = {
  courtId: string
  busy: Array<{ startMins: number; endMins: number }>
}

const PILLS_PER_TENANT = 3

/**
 * Asigna a cada horario candidato la primera cancha sin solapamiento (puro).
 * `courts` viene ordenado (created_at): la elección es determinística.
 */
export function pickFreeSlotPills(
  candidateTimes: string[],
  durationMins: number,
  courts: CourtOccupancy[],
  cap: number,
): SlotPill[] {
  const pills: SlotPill[] = []
  for (const time of candidateTimes) {
    if (pills.length >= cap) break
    const start = timeToMins(time)
    const end = start + durationMins
    const free = courts.find(
      (c) => !c.busy.some((b) => b.startMins < end && b.endMins > start),
    )
    if (free) pills.push({ time, courtId: free.courtId, durationMins })
  }
  return pills
}

/**
 * Hasta 3 turnos libres por tenant a partir de la hora buscada (tenantId →
 * pills), para mostrar como badges clickeables en las cards de /explorar.
 * Mismas semánticas puras que la grilla del perfil (generateSlots) + una sola
 * query cross-tenant de courts/bookings — mismo caveat RLS que
 * loadAvailableTenantIds (fail-closed: sin filas no hay pills, no hay leak).
 * Sin cache propio: corre solo sobre la página visible (≤12 tenants); puede
 * divergir ~30s del filtro cacheado de findAvailableTenantIds, en cuyo caso
 * la card simplemente no muestra pills.
 */
export async function findFreeSlotPillsByTenant(params: {
  tenantIds: string[]
  date: string // YYYY-MM-DD (validated upstream)
  time: string // HH:MM (validated upstream)
  formats?: number[]
}): Promise<Record<string, SlotPill[]>> {
  return withSpan('search.availability.pills', 'db.query.search', () =>
    loadFreeSlotPillsByTenant(params),
  )
}

async function loadFreeSlotPillsByTenant({
  tenantIds,
  date,
  time,
  formats,
}: {
  tenantIds: string[]
  date: string
  time: string
  formats?: number[]
}): Promise<Record<string, SlotPill[]>> {
  if (tenantIds.length === 0) return {}
  const db = getDb()
  const rows = await db
    .select({
      id: tenants.id,
      openingHours: tenants.openingHours,
      closedDates: tenants.closedDates,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(inArray(tenants.id, tenantIds))

  // Current time in ART. Argentina = UTC-3, no DST.
  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const now = {
    nowDateStr: artNow.toISOString().slice(0, 10),
    nowMins: artNow.getUTCHours() * 60 + artNow.getUTCMinutes(),
  }

  // Horarios candidatos por tenant (grilla pura, sin ocupación): libres por
  // agenda y >= la hora buscada.
  const candidates = new Map<string, { times: string[]; durationMins: number }>()
  for (const row of rows) {
    const s = row.settings as TenantSettings
    const durationMins = SLOT_DURATION_MINUTES
    if (date > addDays(now.nowDateStr, s.booking_advance_days ?? 6)) continue
    const [y, mo, d] = date.split('-').map(Number)
    const dayKey = DAY_KEYS[new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1)).getUTCDay()]!
    const dayHours = (row.openingHours as OpeningHours)[dayKey as keyof OpeningHours]
    const closedDay =
      dayHours?.closed === true || ((row.closedDates ?? []) as string[]).includes(date)
    const slots = generateSlots({
      courtId: 'probe',
      pricing: { rules: [] },
      dayKey,
      openHhmm: dayHours?.open ?? '08:00',
      closeHhmm: dayHours?.close ?? '23:00',
      closedDay,
      courtBookings: [],
      durationMins,
      date,
      nowDateStr: now.nowDateStr,
      nowMins: now.nowMins,
    })
    const times = slots
      .filter((sl) => sl.status === 'free' && sl.time >= time)
      .map((sl) => sl.time)
    if (times.length > 0) candidates.set(row.id, { times, durationMins })
  }
  if (candidates.size === 0) return {}

  // Una sola pasada cross-tenant: canchas online + sus reservas del día.
  const idList = sql.join(
    Array.from(candidates.keys()).map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const formatCond = formats?.length
    ? sql` AND c.format IN (${sql.join(formats.map((f) => sql`${f}`), sql`, `)})`
    : sql``
  const result = await db.execute(sql`
    SELECT c.tenant_id AS tenant_id, c.id AS court_id,
           b.time_start::text AS time_start, b.time_end::text AS time_end
    FROM courts c
    LEFT JOIN bookings b
      ON b.court_id = c.id
     AND b.tenant_id = c.tenant_id
     AND b.date = ${date}::date
     AND b.status IN ('pending_payment', 'confirmed')
    WHERE c.tenant_id IN (${idList})
      AND c.status = 'online'${formatCond}
    ORDER BY c.created_at
  `)

  const courtsByTenant = new Map<string, Map<string, CourtOccupancy>>()
  for (const r of result as unknown as Array<{
    tenant_id: string
    court_id: string
    time_start: string | null
    time_end: string | null
  }>) {
    let courtMap = courtsByTenant.get(r.tenant_id)
    if (!courtMap) {
      courtMap = new Map()
      courtsByTenant.set(r.tenant_id, courtMap)
    }
    let occ = courtMap.get(r.court_id)
    if (!occ) {
      occ = { courtId: r.court_id, busy: [] }
      courtMap.set(r.court_id, occ)
    }
    if (r.time_start && r.time_end) {
      const endMins = timeToMins(r.time_end.slice(0, 5))
      occ.busy.push({
        startMins: timeToMins(r.time_start.slice(0, 5)),
        // legacy guard: un slot que termina a medianoche puede venir como 00:00
        endMins: endMins === 0 ? 24 * 60 : endMins,
      })
    }
  }

  const out: Record<string, SlotPill[]> = {}
  for (const [tenantId, { times, durationMins }] of Array.from(candidates.entries())) {
    const courtMap = courtsByTenant.get(tenantId)
    if (!courtMap) continue
    const courtList = Array.from(courtMap.values())
    const pills = pickFreeSlotPills(times, durationMins, courtList, PILLS_PER_TENANT)
    if (pills.length > 0) out[tenantId] = pills
  }

  track.search('search.availability.pills', {
    date,
    time,
    tenants: tenantIds.length,
    withPills: Object.keys(out).length,
  })
  return out
}
