import { sql } from 'drizzle-orm'
import { getDb, withTenantContext } from '@/shared/db/client'
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
