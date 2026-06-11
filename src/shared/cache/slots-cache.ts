import { Redis } from '@upstash/redis'
import type { AvailableSlot } from '@/modules/bookings/booking.types'

/**
 * Read-through cache for per-court availability (`getAvailableSlots`).
 *
 * Key pattern: `slots:{courtId}:{date}:{duration}` (TTL 30s).
 *
 * Design rules:
 *  - FAIL-OPEN. The cache is a latency optimisation, never a source of truth.
 *    Any Redis error (missing env, network, timeout) degrades to a direct DB
 *    read; it must never break a booking flow.
 *  - Bounded staleness. The 30s TTL means even a missed invalidation self-heals
 *    within half a minute, so invalidation is best-effort, not transactional.
 *  - Invalidation deletes every duration for a court+date because a single
 *    booking change affects both the 60' and 120' grids.
 */

export const SLOTS_CACHE_TTL_SECONDS = 30

// Turn durations supported by the product (doc CLAUDE.md: 60 or 120, never 90).
export const SLOT_DURATIONS = [60, 120] as const

// Minimal surface we need from Upstash Redis — keeps the module testable with a
// plain in-memory double and decoupled from the full client type. The SET ops
// (sadd/smembers/expire) back the per-date key tracking of the availability
// search cache.
export interface SlotsCacheStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>
  del(...keys: string[]): Promise<unknown>
  sadd(key: string, ...members: string[]): Promise<unknown>
  smembers(key: string): Promise<string[]>
  expire(key: string, seconds: number): Promise<unknown>
}

let _store: SlotsCacheStore | null = null
let _resolved = false

export function getSlotsCacheStore(): SlotsCacheStore | null {
  if (_resolved) return _store
  _resolved = true
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    _store = null
    return null
  }
  _store = new Redis({ url, token }) as unknown as SlotsCacheStore
  return _store
}

export function __setSlotsCacheStoreForTests(store: SlotsCacheStore | null): void {
  _store = store
  _resolved = true
}

export function __resetSlotsCacheForTests(): void {
  _store = null
  _resolved = false
}

function normalizeDate(date: string | Date): string {
  return typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10)
}

export function slotsCacheKey(
  courtId: string,
  date: string | Date,
  duration: number,
): string {
  return `slots:${courtId}:${normalizeDate(date)}:${duration}`
}

export async function getCachedSlots(
  courtId: string,
  date: string | Date,
  duration: number,
): Promise<AvailableSlot[] | null> {
  const store = getSlotsCacheStore()
  if (!store) return null
  try {
    const raw = await store.get(slotsCacheKey(courtId, date, duration))
    if (raw == null) return null
    // Upstash auto-deserializes JSON; a stringified payload comes back parsed,
    // but tolerate both shapes to stay double-friendly.
    return typeof raw === 'string'
      ? (JSON.parse(raw) as AvailableSlot[])
      : (raw as AvailableSlot[])
  } catch {
    return null // fail-open
  }
}

export async function setCachedSlots(
  courtId: string,
  date: string | Date,
  duration: number,
  slots: AvailableSlot[],
): Promise<void> {
  const store = getSlotsCacheStore()
  if (!store) return
  try {
    await store.set(slotsCacheKey(courtId, date, duration), JSON.stringify(slots), {
      ex: SLOTS_CACHE_TTL_SECONDS,
    })
  } catch {
    // fail-open: a write miss just means the next read recomputes
  }
}

export async function invalidateCourtDateSlots(
  courtId: string,
  date: string | Date,
): Promise<void> {
  const store = getSlotsCacheStore()
  if (!store) return
  try {
    const keys = SLOT_DURATIONS.map((d) => slotsCacheKey(courtId, date, d))
    await store.del(...keys)
  } catch {
    // fail-open: bounded by the 30s TTL anyway
  }
  // A booking change on this date also stales the cross-tenant availability
  // search for it. Same funnel, same best-effort contract.
  await invalidateAvailSearch(date)
}

// ─── Cross-tenant availability search cache ─────────────────────────
//
// Key pattern: `avail-search:{date}:{time}:{formats|all}` → string[] of tenant
// ids (TTL 30s). Because a booking mutation only knows its court+date (not
// which searches it affects), every written key is tracked in a per-date Redis
// SET (`avail-search:keys:{date}`) so invalidateAvailSearch can enumerate and
// delete them. The tracking set carries its own TTL as garbage collection.

export const AVAIL_SEARCH_TTL_SECONDS = SLOTS_CACHE_TTL_SECONDS

// Tracking set must outlive the entries it tracks; 120s ≫ 30s with margin.
const AVAIL_SEARCH_TRACKING_TTL_SECONDS = 120

export function availSearchKey(
  date: string | Date,
  time: string,
  formats?: number[],
): string {
  const formatsKey = formats?.length
    ? [...formats].sort((a, b) => a - b).join('-')
    : 'all'
  return `avail-search:${normalizeDate(date)}:${time}:${formatsKey}`
}

export function availSearchTrackingKey(date: string | Date): string {
  return `avail-search:keys:${normalizeDate(date)}`
}

async function getCachedAvailSearch(key: string): Promise<string[] | null> {
  const store = getSlotsCacheStore()
  if (!store) return null
  try {
    const raw = await store.get(key)
    if (raw == null) return null
    return typeof raw === 'string' ? (JSON.parse(raw) as string[]) : (raw as string[])
  } catch {
    return null // fail-open
  }
}

async function setCachedAvailSearch(
  date: string | Date,
  key: string,
  tenantIds: string[],
): Promise<void> {
  const store = getSlotsCacheStore()
  if (!store) return
  try {
    await store.set(key, JSON.stringify(tenantIds), { ex: AVAIL_SEARCH_TTL_SECONDS })
    const tracking = availSearchTrackingKey(date)
    await store.sadd(tracking, key)
    await store.expire(tracking, AVAIL_SEARCH_TRACKING_TTL_SECONDS)
  } catch {
    // fail-open: an untracked entry self-heals via its 30s TTL
  }
}

/**
 * Read-through cache for the cross-tenant availability search. Same contract
 * as readThroughSlots: always fails open to the loader.
 */
export async function readThroughAvailSearch(
  date: string | Date,
  time: string,
  formats: number[] | undefined,
  loader: () => Promise<string[]>,
): Promise<{ tenantIds: string[]; hit: boolean }> {
  const key = availSearchKey(date, time, formats)
  const cached = await getCachedAvailSearch(key)
  if (cached) return { tenantIds: cached, hit: true }
  const tenantIds = await loader()
  await setCachedAvailSearch(date, key, tenantIds)
  return { tenantIds, hit: false }
}

/** Deletes every cached availability search for a date (plus the tracking set). */
export async function invalidateAvailSearch(date: string | Date): Promise<void> {
  const store = getSlotsCacheStore()
  if (!store) return
  try {
    const tracking = availSearchTrackingKey(date)
    const keys = await store.smembers(tracking)
    await store.del(...keys, tracking)
  } catch {
    // fail-open: bounded by the 30s TTL anyway
  }
}

/**
 * Read-through helper: returns the cached slots on a hit, otherwise runs
 * `loader`, populates the cache, and returns the fresh result. `hit` is exposed
 * for observability/tests. Always fails open to the loader.
 */
export async function readThroughSlots(
  courtId: string,
  date: string | Date,
  duration: number,
  loader: () => Promise<AvailableSlot[]>,
): Promise<{ slots: AvailableSlot[]; hit: boolean }> {
  const cached = await getCachedSlots(courtId, date, duration)
  if (cached) return { slots: cached, hit: true }
  const slots = await loader()
  await setCachedSlots(courtId, date, duration, slots)
  return { slots, hit: false }
}
