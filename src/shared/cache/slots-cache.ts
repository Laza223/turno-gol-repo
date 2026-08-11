import { Redis } from '@upstash/redis'

/**
 * Cache de la búsqueda de disponibilidad cross-tenant (`/explorar`).
 *
 * Key pattern: `avail-search:{date}:{time}:{formats|all}` → string[] de tenant
 * ids (TTL 30s).
 *
 * Design rules:
 *  - FAIL-OPEN. El cache es una optimización de latencia, nunca fuente de
 *    verdad. Cualquier error de Redis (env faltante, red, timeout) degrada a
 *    lectura directa contra la base; jamás puede romper un flujo de reserva.
 *  - Bounded staleness. El TTL de 30s hace que hasta una invalidación perdida
 *    se auto-cure en medio minuto, así que invalidar es best-effort, no
 *    transaccional.
 *
 * HISTORIA (B5, 2026-08-09): este módulo tenía además un cache read-through
 * POR CANCHA (`slots:{courtId}:{date}:{duration}`) con su propio
 * `readThroughSlots`/`getCachedSlots`/`setCachedSlots`. Se eliminó: no tenía un
 * solo lector, y las 11 invalidaciones cableadas en los mutadores de `bookings`
 * estaban borrando claves que nadie escribía nunca. No fue un olvido, fue un
 * desajuste de forma: el único consumidor que lo querría es
 * `getPublicAvailability`, que resuelve TODAS las canchas del complejo en una
 * sola query, así que un cache por-cancha lo habría convertido en N GETs a
 * Redis para reemplazar 1 query — más lento, no más rápido. Encima esa ruta ya
 * cachea en el borde (`s-maxage=30, stale-while-revalidate=60` en
 * `api/public/availability`). Si algún día hace falta cachear disponibilidad
 * pública, la forma correcta es por tenant+fecha, no por cancha, y con la
 * medición de D6 delante.
 */

// TTL de las entradas de búsqueda. El set de tracking usa el suyo, más largo.
export const AVAIL_SEARCH_TTL_SECONDS = 30

// Superficie mínima que necesitamos de Upstash Redis — mantiene el módulo
// testeable con un doble en memoria y desacoplado del tipo completo del
// cliente. Las ops de SET (sadd/smembers/expire) sostienen el tracking de
// claves por fecha.
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

function getSlotsCacheStore(): SlotsCacheStore | null {
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

// ─── Cross-tenant availability search cache ─────────────────────────
//
// Como una mutación de reserva solo conoce su cancha+fecha (no qué búsquedas
// afecta), cada clave escrita se registra en un SET de Redis por fecha
// (`avail-search:keys:{date}`) para que `invalidateAvailSearch` pueda
// enumerarlas y borrarlas. El set de tracking lleva su propio TTL como
// recolección de basura.

// El set de tracking tiene que sobrevivir a las entradas que trackea; 120s ≫ 30s con margen.
const AVAIL_SEARCH_TRACKING_TTL_SECONDS = 120

export function availSearchKey(date: string | Date, time: string, formats?: number[]): string {
  const formatsKey = formats?.length ? [...formats].sort((a, b) => a - b).join('-') : 'all'
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
    // Upstash auto-deserializa JSON; un payload stringificado vuelve parseado,
    // pero toleramos las dos formas para seguir siendo amigables con el doble.
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
    // fail-open: una entrada sin trackear se auto-cura con su TTL de 30s
  }
}

/**
 * Read-through cache de la búsqueda de disponibilidad cross-tenant. Siempre
 * falla abierto al loader.
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

/**
 * Borra toda búsqueda de disponibilidad cacheada para una fecha (más el set de
 * tracking). La llaman los mutadores de `bookings`: una reserva nueva, movida o
 * cancelada cambia quién tiene lugar libre ese día.
 */
export async function invalidateAvailSearch(date: string | Date): Promise<void> {
  const store = getSlotsCacheStore()
  if (!store) return
  try {
    const tracking = availSearchTrackingKey(date)
    const keys = await store.smembers(tracking)
    await store.del(...keys, tracking)
  } catch {
    // fail-open: acotado por el TTL de 30s de todos modos
  }
}
