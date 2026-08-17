import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { getDb, withTenantContext } from '@/shared/db/client'
import { featureFlags } from '@/shared/db/schema'
import { logger } from '@/shared/lib/logger'

/**
 * Feature flags (Fase 6) — operational toggles backed by the `feature_flags`
 * table, no redeploy needed.
 *
 *   - A GLOBAL row (tenant_id NULL) is the system default for a key.
 *   - A per-TENANT row overrides the global default for that tenant (e.g. the
 *     `suspended` kill switch).
 *
 * `isFeatureEnabled(flag, tenantId?)` resolves tenant-override → global →
 * `false` (unknown flags are off) and memoizes the result in-process for 60s so
 * the hot path doesn't hit the DB on every request.
 */

/** Loads the resolved value for (flag, tenant) or `undefined` if no row exists. */
export type FlagLoader = (flag: string, tenantId: string | null) => Promise<boolean | undefined>

const TTL_MS = 60_000
const cache = new Map<string, { value: boolean; expiresAt: number }>()

function cacheKey(flag: string, tenantId: string | null): string {
  return `${flag}::${tenantId ?? '__global__'}`
}

/** Drop the in-memory cache. For tests and for ops-driven invalidation. */
export function clearFeatureFlagCache(): void {
  cache.clear()
}

/**
 * Cache + resolution core, decoupled from the DB via `loader` so it is unit
 * testable. A missing flag resolves to `false`. On a loader error it logs and
 * falls back to the last known value (even if expired) — a transient DB blip must
 * not flip a flag — or `false` when nothing is known yet.
 */
export async function resolveFeatureFlag(
  flag: string,
  tenantId: string | null,
  loader: FlagLoader,
): Promise<boolean> {
  const key = cacheKey(flag, tenantId)
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  let value: boolean
  try {
    value = (await loader(flag, tenantId)) ?? false
  } catch (err) {
    logger.warn('feature_flags.load_failed', {
      flag,
      tenantId: tenantId ?? null,
      error: err instanceof Error ? err.message : String(err),
    })
    return hit?.value ?? false
  }

  cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
  return value
}

const dbFlagLoader: FlagLoader = async (flag, tenantId) => {
  if (tenantId) {
    // The tenant override and the global row are both visible under the RLS
    // SELECT policy; NULLS LAST puts the tenant row first so LIMIT 1 prefers the
    // override and falls back to the global default.
    const rows = await withTenantContext(tenantId, (tx) =>
      tx.execute(sql`
        SELECT value
        FROM feature_flags
        WHERE key = ${flag}
          AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
        ORDER BY tenant_id NULLS LAST
        LIMIT 1
      `),
    )
    return (rows as unknown as Array<{ value: boolean }>)[0]?.value
  }

  const rows = await getDb().execute(sql`
    SELECT value
    FROM feature_flags
    WHERE key = ${flag} AND tenant_id IS NULL
    LIMIT 1
  `)
  return (rows as unknown as Array<{ value: boolean }>)[0]?.value
}

/**
 * Is `flag` enabled? With `tenantId`, a per-tenant row overrides the global
 * default; without it, only the global flag is consulted. Unknown flags are off.
 * Memoized in-process for 60s.
 */
export async function isFeatureEnabled(flag: string, tenantId?: string): Promise<boolean> {
  return resolveFeatureFlag(flag, tenantId ?? null, dbFlagLoader)
}

/** Loads every (flag, tenant) pair at once. Missing keys are simply absent. */
export type BatchFlagLoader = (
  flags: string[],
  tenantId: string,
) => Promise<Map<string, boolean | undefined>>

/**
 * Cache-filling core del preload, desacoplado de la DB igual que
 * `resolveFeatureFlag`. Solo pide los flags que no tengan un valor vigente en
 * caché; si no queda ninguno, no toca la DB. Un fallo del loader se traga a
 * propósito: esto es una optimización, y las llamadas a `isFeatureEnabled` que
 * vienen después reintentan por su cuenta con su propia tolerancia a fallos.
 */
export async function warmFeatureFlags(
  flags: string[],
  tenantId: string,
  loader: BatchFlagLoader,
): Promise<void> {
  const now = Date.now()
  const missing = flags.filter((f) => {
    const hit = cache.get(cacheKey(f, tenantId))
    return !hit || hit.expiresAt <= now
  })
  if (missing.length === 0) return

  let resolved: Map<string, boolean | undefined>
  try {
    resolved = await loader(missing, tenantId)
  } catch (err) {
    logger.warn('feature_flags.preload_failed', {
      flags: missing,
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    })
    return
  }

  const expiresAt = Date.now() + TTL_MS
  for (const flag of missing) {
    cache.set(cacheKey(flag, tenantId), { value: resolved.get(flag) ?? false, expiresAt })
  }
}

const dbBatchFlagLoader: BatchFlagLoader = async (flags, tenantId) => {
  // Una sola transacción y un solo statement para todos los flags. Trae hasta
  // dos filas por clave (el override del complejo y el default global) y resuelve
  // la precedencia acá en vez de con un DISTINCT ON: son ≤2 filas por flag y así
  // el criterio "override gana" queda escrito una vez, en JS, igual que la
  // intención del `NULLS LAST` del loader de a uno.
  const rows = await withTenantContext(tenantId, (tx) =>
    tx
      .select({
        key: featureFlags.key,
        value: featureFlags.value,
        tenantId: featureFlags.tenantId,
      })
      .from(featureFlags)
      .where(
        and(
          inArray(featureFlags.key, flags),
          or(eq(featureFlags.tenantId, tenantId), isNull(featureFlags.tenantId)),
        ),
      ),
  )

  const out = new Map<string, boolean | undefined>()
  for (const row of rows) {
    // El override del complejo pisa al global, llegue en el orden que llegue.
    if (row.tenantId !== null || !out.has(row.key)) out.set(row.key, row.value)
  }
  return out
}

/**
 * Resuelve varios flags de un complejo en UNA transacción y los deja en el
 * caché, para que los `isFeatureEnabled` que vienen después no abran una
 * transacción cada uno.
 *
 * El layout de `(admin)` consultaba dos flags (`suspended` por el kill switch y
 * `tournaments` por el menú) y cada uno abría su propia transacción: BEGIN +
 * `set_config` + SELECT + COMMIT, cuatro idas y vueltas a la base por flag, más
 * la presión sobre un pool de 3 conexiones. Con el preload es una sola, y
 * ninguna cuando el caché está caliente.
 */
export async function preloadFeatureFlags(flags: string[], tenantId: string): Promise<void> {
  return warmFeatureFlags(flags, tenantId, dbBatchFlagLoader)
}
