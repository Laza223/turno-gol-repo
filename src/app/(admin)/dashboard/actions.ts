'use server'

import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'

export async function markPublicLinkSharedAction(): Promise<void> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return

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
}
