import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { ReactNode } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveImpersonatedStaffContext } from '@/modules/auth/impersonation.server'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { redirectIfTenantSuspended } from '@/shared/kill-switch'
import { tenantSubscriptions } from '@/shared/db/schema'
import { AdminLayoutShell } from '@/components/layout/admin-layout-shell'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'
import { PushNotificationManagerLoader } from '@/components/admin/PushNotificationManagerLoader'
import { signOutAction } from '@/app/(admin)/actions/auth'
import { stopImpersonationAction } from '@/app/(super-admin)/super-admin/tenants/[id]/actions'

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
        impersonationBanner={
          <ImpersonationBanner tenantName={imp.tenant.name} action={stopImpersonationAction} />
        }
      >
        {children}
        <PushNotificationManagerLoader />
      </AdminLayoutShell>
    )
  }

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff') redirect('/login')
  if (!user.staffUserId) redirect('/login')
  // Cambio forzado de contraseña (tras reset del SuperAdmin): hasta que el staff
  // fije una nueva, no entra al panel. Antes de resolver tenant. Impersonación
  // pasa: imp.user no trae el flag (spec §4.5 / R8).
  if (user.forcePasswordChange) redirect('/reset-password')
  if (!user.tenantId) redirect('/onboarding')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  // Billing-driven hard lock: tenants in these terminal/restricted states cannot
  // access the admin panel regardless of the kill-switch flag (#64).
  // ENS-20: `suspended` se suma acá — antes quedaba afuera del hard-lock pese a
  // ser "solo lectura" en doc4 §2, así que un tenant suspendido entraba al panel
  // completo. `past_due` NO se agrega: sigue con acceso completo (gracia de 7
  // días) — solo recibe el banner de StatusBanner con link a /reactivar.
  // ENS-26: `canceled` se SACA del hard-lock. `lifecycle.service.ts` diseña la
  // baja voluntaria con el período ya pagado intacto ("* → canceled; period_end
  // intact") y expulsar al dueño al instante lo contradice — pagó hasta
  // current_period_end. El sweep `canceled → blocked` recién corta el acceso
  // cuando vence el período, y `blocked` sigue en esta lista.
  if (['blocked', 'churned', 'deleted', 'suspended'].includes(tenant.status)) {
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
      <PushNotificationManagerLoader />
    </AdminLayoutShell>
  )
}
