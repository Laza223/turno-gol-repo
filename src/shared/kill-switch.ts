import { redirect } from 'next/navigation'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { logger } from '@/shared/lib/logger'

/** Feature-flag key for the per-tenant kill switch. */
export const TENANT_SUSPENDED_FLAG = 'suspended'

/** Timeout (ms) para la consulta del kill switch. Fail-open: si la DB tarda, no se suspende. */
const KILL_SWITCH_TIMEOUT_MS = 2_000

/**
 * Kill switch (Fase 6 #5): if the tenant carries the `suspended` feature flag,
 * redirect to /suspended.
 *
 * This is an instant ops lever — flip the per-tenant flag, no redeploy — and is
 * INTENTIONALLY separate from `tenant_status = 'suspended'` (the billing-driven
 * read-only mode gated in with-tenant.ts). It must run in a Node runtime because
 * it reads Postgres via the feature-flags helper; Next.js Edge middleware can't
 * reach the DB, so the gate lives in the admin layout — the first Node-runtime
 * point with tenant context — rather than middleware.ts.
 *
 * `redirect()` throws Next's NEXT_REDIRECT control-flow signal, so this function
 * does not return when the tenant is suspended.
 *
 * Fix #56: la llamada a isFeatureEnabled tiene un timeout de 2 s. Si la DB tarda
 * más (cold path, reinicio de proceso), se hace fail-open (no se suspende) para
 * no bloquear al admin layout indefinidamente.
 */
export async function redirectIfTenantSuspended(tenantId: string): Promise<void> {
  let isSuspended: boolean
  try {
    isSuspended = await Promise.race([
      isFeatureEnabled(TENANT_SUSPENDED_FLAG, tenantId),
      new Promise<false>((resolve) =>
        setTimeout(() => resolve(false), KILL_SWITCH_TIMEOUT_MS),
      ),
    ])
  } catch (err) {
    logger.warn('kill_switch.check_failed', {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    })
    return
  }

  if (isSuspended) {
    redirect('/suspended')
  }
}
