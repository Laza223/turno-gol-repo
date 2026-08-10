import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AVAIL_SEARCH_TTL_SECONDS,
  availSearchKey,
  availSearchTrackingKey,
  readThroughAvailSearch,
  invalidateAvailSearch,
  __setSlotsCacheStoreForTests,
  __resetSlotsCacheForTests,
  type SlotsCacheStore,
} from '@/shared/cache/slots-cache'

// In-memory Redis double covering the SET-tracking surface (sadd/smembers/expire)
// that the availability-search cache needs on top of get/set/del.
class FakeStore implements SlotsCacheStore {
  map = new Map<string, unknown>()
  sets = new Map<string, Set<string>>()
  expirations = new Map<string, number>()
  lastSetEx: number | null = null
  deleted: string[] = []
  throwOnGet = false
  throwOnSet = false
  throwOnSadd = false

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
      if (this.sets.delete(k)) n++
    }
    return n
  }
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (this.throwOnSadd) throw new Error('redis-down')
    const set = this.sets.get(key) ?? new Set<string>()
    let added = 0
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m)
        added++
      }
    }
    this.sets.set(key, set)
    return added
  }
  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? [])
  }
  async expire(key: string, seconds: number): Promise<number> {
    this.expirations.set(key, seconds)
    return 1
  }
}

const DATE = '2026-06-11'
const TIME = '20:00'
const TENANT_IDS = [
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
]

let store: FakeStore

beforeEach(() => {
  store = new FakeStore()
  __setSlotsCacheStoreForTests(store)
})

afterEach(() => {
  __resetSlotsCacheForTests()
})

describe('availSearchKey', () => {
  it('builds avail-search:{date}:{time}:all when no formats are given', () => {
    expect(availSearchKey(DATE, TIME)).toBe('avail-search:2026-06-11:20:00:all')
  })

  it('sorts formats so [7,5] and [5,7] share the same key', () => {
    expect(availSearchKey(DATE, TIME, [7, 5])).toBe(
      'avail-search:2026-06-11:20:00:5-7',
    )
    expect(availSearchKey(DATE, TIME, [5, 7])).toBe(
      availSearchKey(DATE, TIME, [7, 5]),
    )
  })
})

describe('readThroughAvailSearch', () => {
  it('calls the loader once and serves the second call from cache', async () => {
    const loader = vi.fn(async () => TENANT_IDS)

    const first = await readThroughAvailSearch(DATE, TIME, undefined, loader)
    expect(first).toEqual({ tenantIds: TENANT_IDS, hit: false })
    expect(loader).toHaveBeenCalledTimes(1)

    const second = await readThroughAvailSearch(DATE, TIME, undefined, loader)
    expect(second).toEqual({ tenantIds: TENANT_IDS, hit: true })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('writes the 30 second TTL', async () => {
    await readThroughAvailSearch(DATE, TIME, undefined, async () => TENANT_IDS)
    expect(store.lastSetEx).toBe(AVAIL_SEARCH_TTL_SECONDS)
    expect(AVAIL_SEARCH_TTL_SECONDS).toBe(30)
  })

  it('caches an empty result (no tenants available is a valid answer)', async () => {
    const loader = vi.fn(async () => [] as string[])
    await readThroughAvailSearch(DATE, TIME, undefined, loader)
    const second = await readThroughAvailSearch(DATE, TIME, undefined, loader)
    expect(second).toEqual({ tenantIds: [], hit: true })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('tracks the written key in the per-date set with a TTL longer than the entry', async () => {
    await readThroughAvailSearch(DATE, TIME, [5], async () => TENANT_IDS)

    const tracking = availSearchTrackingKey(DATE)
    expect(await store.smembers(tracking)).toContain(
      availSearchKey(DATE, TIME, [5]),
    )
    const setTtl = store.expirations.get(tracking)
    expect(setTtl).toBeGreaterThan(AVAIL_SEARCH_TTL_SECONDS)
  })

  it('falls back to the loader on every call when Redis is unavailable', async () => {
    __setSlotsCacheStoreForTests(null)
    const loader = vi.fn(async () => TENANT_IDS)

    await readThroughAvailSearch(DATE, TIME, undefined, loader)
    await readThroughAvailSearch(DATE, TIME, undefined, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('still returns the loader result when the tracking sadd fails (fail-open)', async () => {
    store.throwOnSadd = true
    const result = await readThroughAvailSearch(DATE, TIME, undefined, async () => TENANT_IDS)
    expect(result.tenantIds).toEqual(TENANT_IDS)
  })
})

describe('invalidateAvailSearch', () => {
  it('deletes every tracked key for the date plus the tracking set itself', async () => {
    await readThroughAvailSearch(DATE, TIME, undefined, async () => TENANT_IDS)
    await readThroughAvailSearch(DATE, '21:00', [5], async () => TENANT_IDS)

    await invalidateAvailSearch(DATE)

    const miss = await readThroughAvailSearch(DATE, TIME, undefined, async () => [])
    expect(miss).toEqual({ tenantIds: [], hit: false })
    expect(store.deleted).toContain(availSearchKey(DATE, TIME))
    expect(store.deleted).toContain(availSearchKey(DATE, '21:00', [5]))
    expect(store.deleted).toContain(availSearchTrackingKey(DATE))
  })

  it('does not touch other dates', async () => {
    await readThroughAvailSearch('2026-06-12', TIME, undefined, async () => TENANT_IDS)

    await invalidateAvailSearch(DATE)

    const other = await readThroughAvailSearch('2026-06-12', TIME, undefined, async () => [])
    expect(other).toEqual({ tenantIds: TENANT_IDS, hit: true })
  })

  it('is a no-op without Redis', async () => {
    __setSlotsCacheStoreForTests(null)
    await expect(invalidateAvailSearch(DATE)).resolves.toBeUndefined()
  })
})

// B5 (2026-08-09): antes esto era `describe('invalidateCourtDateSlots funnel')`
// y probaba que la invalidación por cancha+fecha "arrastrara" a la del buscador.
// El cache por cancha se eliminó (no tenía un solo lector, ver el docstring de
// slots-cache.ts), así que los mutadores de bookings ahora llaman derecho a
// `invalidateAvailSearch`. El caso que sí valía la pena — que acepte un Date y
// no solo un string, porque `bookings.date` viaja como Date desde Drizzle —
// sobrevive acá.
describe('invalidateAvailSearch — mutación de reserva', () => {
  it('acepta un Date y limpia igual el cache de búsqueda de ese día', async () => {
    await readThroughAvailSearch(DATE, TIME, undefined, async () => TENANT_IDS)

    await invalidateAvailSearch(new Date(`${DATE}T12:00:00.000Z`))

    const after = await readThroughAvailSearch(DATE, TIME, undefined, async () => [])
    expect(after.hit).toBe(false)
  })
})
