import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AvailableSlot } from '@/modules/bookings/booking.types'
import {
  SLOTS_CACHE_TTL_SECONDS,
  SLOT_DURATIONS,
  slotsCacheKey,
  getCachedSlots,
  setCachedSlots,
  invalidateCourtDateSlots,
  readThroughSlots,
  __setSlotsCacheStoreForTests,
  __resetSlotsCacheForTests,
  type SlotsCacheStore,
} from '@/shared/cache/slots-cache'

// In-memory Redis double. Records the TTL used on each set and the keys deleted,
// so we can assert the cache writes a 30s TTL and invalidates both durations.
class FakeStore implements SlotsCacheStore {
  map = new Map<string, unknown>()
  lastSetEx: number | null = null
  deleted: string[] = []
  throwOnGet = false
  throwOnSet = false

  async get(key: string): Promise<unknown> {
    if (this.throwOnGet) throw new Error('redis-down')
    return this.map.has(key) ? this.map.get(key) : null
  }
  async set(key: string, value: unknown, opts: { ex: number }): Promise<unknown> {
    if (this.throwOnSet) throw new Error('redis-down')
    this.lastSetEx = opts.ex
    this.map.set(key, value)
    return 'OK'
  }
  async del(...keys: string[]): Promise<number> {
    let n = 0
    for (const k of keys) {
      this.deleted.push(k)
      if (this.map.delete(k)) n++
    }
    return n
  }
}

const COURT = '11111111-1111-1111-1111-111111111111'
const DATE = '2026-06-01'
const SLOTS: AvailableSlot[] = [
  { timeStart: '16:00', timeEnd: '17:00', price: 10000, available: true },
  { timeStart: '17:00', timeEnd: '18:00', price: 10000, available: false },
]

let store: FakeStore

beforeEach(() => {
  store = new FakeStore()
  __setSlotsCacheStoreForTests(store)
})

afterEach(() => {
  __resetSlotsCacheForTests()
})

describe('slotsCacheKey', () => {
  it('builds the slots:{courtId}:{date}:{duration} pattern', () => {
    expect(slotsCacheKey(COURT, DATE, 60)).toBe(`slots:${COURT}:2026-06-01:60`)
    expect(slotsCacheKey(COURT, DATE, 120)).toBe(`slots:${COURT}:2026-06-01:120`)
  })

  it('normalizes a Date to YYYY-MM-DD', () => {
    expect(slotsCacheKey(COURT, new Date('2026-06-01T00:00:00.000Z'), 60)).toBe(
      `slots:${COURT}:2026-06-01:60`,
    )
  })
})

describe('get / set round-trip', () => {
  it('returns null on a cache miss', async () => {
    expect(await getCachedSlots(COURT, DATE, 60)).toBeNull()
  })

  it('round-trips the slots array', async () => {
    await setCachedSlots(COURT, DATE, 60, SLOTS)
    expect(await getCachedSlots(COURT, DATE, 60)).toEqual(SLOTS)
  })

  it('writes a 30 second TTL', async () => {
    await setCachedSlots(COURT, DATE, 60, SLOTS)
    expect(store.lastSetEx).toBe(30)
    expect(SLOTS_CACHE_TTL_SECONDS).toBe(30)
  })

  it('scopes entries by duration', async () => {
    await setCachedSlots(COURT, DATE, 60, SLOTS)
    expect(await getCachedSlots(COURT, DATE, 120)).toBeNull()
  })
})

describe('invalidateCourtDateSlots', () => {
  it('deletes every configured duration for the court+date', async () => {
    await setCachedSlots(COURT, DATE, 60, SLOTS)
    await setCachedSlots(COURT, DATE, 120, SLOTS)

    await invalidateCourtDateSlots(COURT, DATE)

    expect(await getCachedSlots(COURT, DATE, 60)).toBeNull()
    expect(await getCachedSlots(COURT, DATE, 120)).toBeNull()
    expect(store.deleted).toEqual(
      SLOT_DURATIONS.map((d) => `slots:${COURT}:2026-06-01:${d}`),
    )
  })

  it('accepts a Date and normalizes it', async () => {
    await invalidateCourtDateSlots(COURT, new Date('2026-06-01T12:00:00.000Z'))
    expect(store.deleted).toContain(`slots:${COURT}:2026-06-01:60`)
  })
})

describe('fail-open behaviour', () => {
  it('treats a missing Redis (no env) as a permanent miss without throwing', async () => {
    __setSlotsCacheStoreForTests(null)
    expect(await getCachedSlots(COURT, DATE, 60)).toBeNull()
    await expect(setCachedSlots(COURT, DATE, 60, SLOTS)).resolves.toBeUndefined()
    await expect(invalidateCourtDateSlots(COURT, DATE)).resolves.toBeUndefined()
  })

  it('returns null (does not throw) when Redis get fails', async () => {
    store.throwOnGet = true
    expect(await getCachedSlots(COURT, DATE, 60)).toBeNull()
  })

  it('swallows Redis set failures', async () => {
    store.throwOnSet = true
    await expect(setCachedSlots(COURT, DATE, 60, SLOTS)).resolves.toBeUndefined()
  })
})

describe('readThroughSlots', () => {
  it('calls the loader on a miss and populates the cache', async () => {
    const loader = vi.fn(async () => SLOTS)

    const first = await readThroughSlots(COURT, DATE, 60, loader)
    expect(first).toEqual({ slots: SLOTS, hit: false })
    expect(loader).toHaveBeenCalledTimes(1)

    // Second call hits the cache and never touches the loader again.
    const second = await readThroughSlots(COURT, DATE, 60, loader)
    expect(second).toEqual({ slots: SLOTS, hit: true })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('falls back to the loader on every call when Redis is unavailable', async () => {
    __setSlotsCacheStoreForTests(null)
    const loader = vi.fn(async () => SLOTS)

    await readThroughSlots(COURT, DATE, 60, loader)
    await readThroughSlots(COURT, DATE, 60, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
