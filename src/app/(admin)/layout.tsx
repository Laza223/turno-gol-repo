import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { ReactNode } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { tenantSubscriptions } from '@/shared/db/schema'
import { AdminLayoutShell } from '@/components/layout/admin-layout-shell'
import { signOutAction } from '@/app/(admin)/actions/auth'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff') redirect('/login')
  if (!user.staffUserId) redirect('/login')
  if (!user.tenantId) redirect('/onboarding')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  if (!tenant.settings.onboarding_completed) redirect('/onboarding')

  const sub = await withTenantContext(tenant.id, async (tx) => {
    return tx
      .select({ currentPeriodEnd: tenantSubscriptions.currentPeriodEnd })
      .from(tenantSubscriptions)
      .where(eq(tenantSubscriptions.tenantId, tenant.id))
      .limit(1)
      .then((r) => r[0] ?? null)
  })

  return (
    <AdminLayoutShell
      tenantName={tenant.name}
      tenantStatus={tenant.status}
      trialEndsAt={tenant.trialEndsAt?.toISOString() ?? null}
      periodEnd={sub?.currentPeriodEnd?.toISOString() ?? null}
      userEmail={user.email}
      signOut={signOutAction}
    >
      {children}
    </AdminLayoutShell>
  )
}
