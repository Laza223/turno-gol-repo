import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { ReactNode } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { redirectIfTenantSuspended } from '@/shared/kill-switch'
import { tenantSubscriptions } from '@/shared/db/schema'
import dynamic from 'next/dynamic'
import { AdminLayoutShell } from '@/components/layout/admin-layout-shell'
import { signOutAction } from '@/app/(admin)/actions/auth'

const PushNotificationManager = dynamic(
  () => import('@/components/admin/PushNotificationManager').then((m) => m.PushNotificationManager),
  { ssr: false, loading: () => null },
)

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff') redirect('/login')
  if (!user.staffUserId) redirect('/login')
  if (!user.tenantId) redirect('/onboarding')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  // Billing-driven hard lock: tenants in these terminal/restricted states cannot
  // access the admin panel regardless of the kill-switch flag (#64).
  if (['blocked', 'churned', 'canceled', 'deleted'].includes(tenant.status)) {
    redirect('/suspended')
  }

  // Kill switch: an ops-flipped `suspended` flag locks the tenant out of the
  // panel instantly (no redeploy). Distinct from tenant_status — see kill-switch.ts.
  await redirectIfTenantSuspended(tenant.id)

  if (tenant.settings.onboarding_completed !== true) redirect('/onboarding')

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
      <PushNotificationManager />
    </AdminLayoutShell>
  )
}
