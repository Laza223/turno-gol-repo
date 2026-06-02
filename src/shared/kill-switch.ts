import { redirect } from 'next/navigation'
import { isFeatureEnabled } from '@/shared/feature-flags'

/** Feature-flag key for the per-tenant kill switch. */
export const TENANT_SUSPENDED_FLAG = 'suspended'

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
 */
export async function redirectIfTenantSuspended(tenantId: string): Promise<void> {
  if (await isFeatureEnabled(TENANT_SUSPENDED_FLAG, tenantId)) {
    redirect('/suspended')
  }
}
