'use server'

import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'

export type MarkSharedResult = { success: true } | { success: false; error: string }

/**
 * Fix 3 (R5 🟢 residual — R2-1 CERRADO salvo este): usaba extractAuthUser +
 * getStaffTenant crudo, sin pasar por `isBlockedForStaff` — un tenant
 * `blocked`/`suspended` podía tildar el checklist del dashboard por POST
 * directo aunque el resto de las actions ya estuviera cerrado con M5.
 * `requireOperatorStaff()` (mismo guard central que el resto de
 * `(admin)/*\/actions.ts`) cubre sesión + rol + tenant.status en un solo
 * punto.
 */
export async function markPublicLinkSharedAction(): Promise<MarkSharedResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) {
    return { success: false, error: limited }
  }

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || '{"public_link_shared": true}'::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/dashboard')
  return { success: true }
}
