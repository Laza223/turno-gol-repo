import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { ReactNode } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveImpersonatedStaffContext } from '@/modules/auth/impersonation.server'
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
  // Impersonación (spec §6): el super admin entra a CUALQUIER tenant para dar
  // soporte, salteando las puertas de billing/kill-switch/onboarding — puede
  // necesitar entrar justamente a un tenant suspendido o a medio onboarding
  // para arreglarlo. El banner rojo (commit de banner+audit) avisa el modo.
  const imp = await resolveImpersonatedStaffContext()
  if (imp) {
    const impSub = await withTenantContext(imp.tenant.id, async (tx) =>
      tx
        .select({ currentPeriodEnd: tenantSubscriptions.currentPeriodEnd })
        .from(tenantSubscriptions)
        .where(eq(tenantSubscriptions.tenantId, imp.tenant.id))
        .limit(1)
        .then((r) => r[0] ?? null),
    )
    return (
      <AdminLayoutShell
        tenantName={imp.tenant.name}
        tenantStatus={imp.tenant.status}
        trialEndsAt={imp.tenant.trialEndsAt?.toISOString() ?? null}
        periodEnd={impSub?.currentPeriodEnd?.toISOString() ?? null}
        userEmail={imp.user.email}
        signOut={signOutAction}
      >
        {children}
        <PushNotificationManager />
      </AdminLayoutShell>
    )
  }

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
