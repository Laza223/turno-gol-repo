import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { ReactNode } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveImpersonatedStaffContext } from '@/modules/auth/impersonation.server'
import { after } from 'next/server'
import { getStaffTenant, touchStaffSeen } from '@/modules/tenants/tenant.service'
import type { TenantRow } from '@/modules/tenants/tenant.types'
import { getProfileGaps } from '@/modules/tenants/setup-gaps'
import { NO_SETUP_ALERTS, type SetupAlerts } from '@/components/layout/setup-alerts'
import type { FreePlanNotice, ReadOnlyNotice } from '@/components/layout/status-banner'
import {
  artMonthOf,
  BLOCKED_TENANT_STATUSES,
  isFreePlan,
  READ_ONLY_TENANT_STATUSES,
} from '@/modules/tenants/tenant.lifecycle'
import { countCourtsWithoutPhotos } from '@/modules/courts/court.service'
import { withTenantContext } from '@/shared/db/client'
import { redirectIfTenantSuspended } from '@/shared/kill-switch'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { tenantSubscriptions } from '@/shared/db/schema'
import { getStaffRole } from '@/modules/staff/staff.service'
import { AdminLayoutShell } from '@/components/layout/admin-layout-shell'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'
import { signOutAction } from '@/app/(admin)/actions/auth'
import {
  createTabAction,
  loadVenderCatalogAction,
  sellTicketAction,
} from '@/app/(admin)/caja/cantina/actions'
import { VenderProvider } from '@/app/(admin)/dashboard/_components/VenderProvider'
import { stopImpersonationAction } from '@/app/(super-admin)/super-admin/tenants/[id]/actions'
import { resumeOnlineBookingAction } from '@/app/(admin)/dashboard/actions'

/**
 * Lo que el dueño todavía no completó y el jugador sí nota (canchas sin foto,
 * perfil sin portada/logo/ubicación). Se calcula acá, una vez por render, y de acá
 * salen los puntos rojos del menú y de las pestañas. Tras cada acción que sube o
 * borra una imagen, `revalidatePath` vuelve a renderizar este layout, así que el
 * punto se apaga solo cuando se completa.
 */
async function loadSetupAlerts(tenant: TenantRow): Promise<SetupAlerts> {
  const courts = await withTenantContext(tenant.id, (tx) => countCourtsWithoutPhotos(tenant.id, tx))
  return { courts, profile: getProfileGaps(tenant).length }
}

type SubscriptionSummary = {
  currentPeriodEnd: Date | null
  mpSubscriptionId: string | null
  dunningStartedAt: Date | null
}

function loadSubscriptionSummary(tenantId: string): Promise<SubscriptionSummary | null> {
  return withTenantContext(tenantId, async (tx) =>
    tx
      .select({
        currentPeriodEnd: tenantSubscriptions.currentPeriodEnd,
        mpSubscriptionId: tenantSubscriptions.mpSubscriptionId,
        dunningStartedAt: tenantSubscriptions.dunningStartedAt,
      })
      .from(tenantSubscriptions)
      .where(eq(tenantSubscriptions.tenantId, tenantId))
      .limit(1)
      .then((r) => r[0] ?? null),
  )
}

/**
 * Solo lectura (`suspended`): desde el freemium es solo la mora, entre el día 7 y
 * el 14 (la prueba vencida baja directo al plan gratis).
 */
function readOnlyNotice(tenant: TenantRow): ReadOnlyNotice | null {
  if (!READ_ONLY_TENANT_STATUSES.has(tenant.status)) return null
  return { origin: 'dunning', until: null }
}

/** Plan gratis: tope de reservas online del mes y pausa por cancelaciones. */
function freePlanNotice(tenant: TenantRow): FreePlanNotice | null {
  if (!isFreePlan(tenant)) return null
  return {
    capReached: tenant.onlineCapMonth === artMonthOf(),
    paused: tenant.onlinePausedAt !== null,
  }
}

/**
 * El modal de Vender vive acá y no en Hoy: se abre desde cualquier vista del panel
 * (botón del riel o tecla V), así que no hace falta volver a Hoy para vender.
 * En el plan gratis no hay cantina: sin proveedor no hay botón ni tecla V.
 */
function WithVender({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  if (!enabled) return <>{children}</>
  return (
    <VenderProvider
      loadCatalogAction={loadVenderCatalogAction}
      sellTicketAction={sellTicketAction}
      createTabAction={createTabAction}
    >
      {children}
    </VenderProvider>
  )
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Impersonación (spec §6): el super admin entra a CUALQUIER tenant para dar
  // soporte, salteando las puertas de billing/kill-switch/onboarding — puede
  // necesitar entrar justamente a un tenant suspendido o a medio onboarding
  // para arreglarlo. El banner rojo (commit de banner+audit) avisa el modo.
  const imp = await resolveImpersonatedStaffContext()
  if (imp) {
    const [impSub, impAlerts] = await Promise.all([
      loadSubscriptionSummary(imp.tenant.id),
      loadSetupAlerts(imp.tenant),
    ])
    return (
      <WithVender>
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
          staffRole="admin"
          setupAlerts={impAlerts}
          readOnly={readOnlyNotice(imp.tenant)}
        >
          {children}
        </AdminLayoutShell>
      </WithVender>
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

  const tenant = await getStaffTenant(user.staffUserId, user.tenantId)
  if (!tenant) redirect('/login')

  // Uso del panel: mide el gratis abandonado y cancela su borrado si vuelve
  // (freemium, decisión 7). Fuera del render y sin tirar nunca.
  after(() => touchStaffSeen(tenant.id))

  // Billing-driven hard lock: tenants in these terminal/restricted states cannot
  // access the admin panel regardless of the kill-switch flag (#64).
  // `suspended` NO está desde 2026-10-22: es solo lectura (doc4 §2 y
  // `docs/decisions/2026-10-22-solo-lectura-al-vencer-la-prueba.md`). Entra a
  // mirar con el aviso del StatusBanner, y las escrituras las corta el guard
  // central de las Server Actions (`requireStaffWithRole`, hallazgo R2). ENS-20
  // lo había metido acá cuando ese guard todavía no existía y el suspendido
  // entraba al panel completo.
  // `past_due` NO está: sigue con acceso completo (gracia de 7 días) — solo
  // recibe el banner de StatusBanner con link a /reactivar.
  // ENS-26: `canceled` se SACA del hard-lock. `lifecycle.service.ts` diseña la
  // baja voluntaria con el período ya pagado intacto ("* → canceled; period_end
  // intact") y expulsar al dueño al instante lo contradice — pagó hasta
  // current_period_end. El sweep `canceled → blocked` recién corta el acceso
  // cuando vence el período, y `blocked` sigue en esta lista.
  if (BLOCKED_TENANT_STATUSES.has(tenant.status)) {
    redirect('/suspended')
  }

  // Kill switch: an ops-flipped `suspended` flag locks the tenant out of the
  // panel instantly (no redeploy). Distinct from tenant_status — see kill-switch.ts.
  // De paso deja caliente `tournaments`, que el menú de abajo mira: los dos flags
  // salen en la misma transacción en vez de abrir una cada uno.
  await redirectIfTenantSuspended(tenant.id, [TOURNAMENTS_FLAG])

  // En solo lectura el wizard no puede guardar nada: un complejo cuya prueba
  // venció sin terminar el onboarding va directo a la salida.
  if (tenant.settings.onboarding_completed !== true) {
    // El gratis tampoco: sus guards no abren el wizard (freemium).
    redirect(
      READ_ONLY_TENANT_STATUSES.has(tenant.status) || isFreePlan(tenant)
        ? '/reactivar'
        : '/onboarding',
    )
  }

  // Independientes entre sí: van en paralelo. El flag de torneos nace global en
  // false (migr. 062) y se prende por complejo con una fila de override, así el
  // módulo se pilotea sin redeploy. Cachea 60s in-process (feature-flags.ts).
  const [sub, tournamentsEnabled, staffRole, alerts] = await Promise.all([
    loadSubscriptionSummary(tenant.id),
    isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id),
    getStaffRole(tenant.id, user.staffUserId),
    // En paralelo con el rol y no detrás de él: esperarlo sumaría un viaje a la DB en
    // cada carga del panel. Solo el dueño ve los avisos (el encargado no tiene Canchas
    // ni Configuración), así que para el resto se descartan abajo.
    loadSetupAlerts(tenant),
  ])
  const setupAlerts = staffRole === 'admin' ? alerts : NO_SETUP_ALERTS

  return (
    <WithVender enabled={!isFreePlan(tenant)}>
      <AdminLayoutShell
        tenantName={tenant.name}
        tenantStatus={tenant.status}
        trialEndsAt={tenant.trialEndsAt?.toISOString() ?? null}
        periodEnd={sub?.currentPeriodEnd?.toISOString() ?? null}
        userEmail={user.email}
        pushIdentity={`${tenant.id}:${user.staffUserId}`}
        signOut={signOutAction}
        tournamentsEnabled={tournamentsEnabled}
        staffRole={staffRole ?? 'manager'}
        setupAlerts={setupAlerts}
        readOnly={readOnlyNotice(tenant)}
        freePlan={freePlanNotice(tenant)}
        resumeOnlineAction={resumeOnlineBookingAction}
      >
        {children}
      </AdminLayoutShell>
    </WithVender>
  )
}
