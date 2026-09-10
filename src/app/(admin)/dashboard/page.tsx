import { redirect } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import { daySlotsFor } from '@/lib/dashboard/day-bookings'
import { getHoyData } from '@/modules/home/home.service'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { DashboardTour } from '@/components/dashboard/dashboard-tour'
import { WhileYouWereAway } from '@/components/dashboard/WhileYouWereAway'
import { NeedsAttention } from '@/components/dashboard/NeedsAttention'
import { ProximosTurnos } from '@/components/dashboard/ProximosTurnos'
import { PageHeader } from '@/components/admin/PageHeader'
import { getChecklistState } from './queries'
import {
  markPublicLinkSharedAction,
  markTourSeenAction,
  markChecklistDismissedAction,
} from './actions'

/** Fecha de hoy formato medio §8.3: "mié 2 de julio" (nunca ISO ni coma).
 * Armado por partes: el string completo del locale varía entre versiones de ICU
 * (coma, "de" incluido o no) y acá el formato es contrato de diseño. */
function todayMediumArt(): string {
  const tz = { timeZone: 'America/Argentina/Buenos_Aires' } as const
  const now = new Date()
  const weekday = now.toLocaleDateString('es-AR', { weekday: 'short', ...tz }).replace('.', '')
  const day = now.toLocaleDateString('es-AR', { day: 'numeric', ...tz })
  const month = now.toLocaleDateString('es-AR', { month: 'long', ...tz })
  return `${weekday} ${day} de ${month}`
}

export default async function DashboardPage() {
  // B10 — `requireOperatorStaff` y no `requireAdminStaff`, aunque la pantalla
  // sea solo-admin: `requireAdminStaff` rebota al manager A `/dashboard`, que es
  // ESTA página, así que sería un loop de redirects. El guard operator deja
  // pasar a los dos y devuelve el rol ya leído, que es justo lo que hace falta
  // para el rebote de abajo — y ahorra el `getStaffRole` suelto que había acá.
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant, role } = auth

  // D5 (docs/planning/2026-08-01-decisiones-de-fase-v2.md): "Hoy" es solo del
  // admin — no existe versión manager. Mismo patrón que requireAdminStaff
  // (guards.ts:124), destino invertido: acá rebota A la grilla en vez de
  // rebotar DESDE ella. Los 9 call-sites que hacen redirect('/dashboard')
  // genérico (login, onboarding, etc.) siguen aterrizando acá sin tocarlos —
  // el rebote ocurre en el primer render de esta página.
  if (role !== 'admin') redirect('/grilla')

  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const date = operatingDateOf(new Date(), cutoffMins)

  const [data, checklistState] = await Promise.all([
    withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, {
        date,
        cutoffMins,
        openingHours: tenant.openingHours,
        closedDates: tenant.closedDates,
        closesNextDay: tenant.closesNextDay,
      }),
    ),
    getChecklistState(tenant, tenant.settings, !!tenant.mpConnectedAt),
  ])

  // Todos los pasos de la checklist, no solo 2 de 7 (bug: antes el complejo
  // podía dar "por terminado" el onboarding con canchas/horarios sin cargar).
  const allDone = Object.values(checklistState).every(Boolean)
  const showChecklist = !allDone && !tenant.settings.checklist_dismissed_at
  const showTour =
    tenant.settings.onboarding_completed === true && !tenant.settings.admin_tour_seen_at

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const { numbers, whileYouWereAway, needsAttention, upcoming } = data

  // `dayIsClosed` se recalcula acá (función pura, sin DB) porque getHoyData no
  // distingue "día cerrado" de "0 disponible": los dos casos llegan con
  // `available = 0` y se leen distinto en pantalla.
  const dayIsClosed =
    daySlotsFor(date, tenant.openingHours, tenant.closedDates ?? [], tenant.closesNextDay)
      .length === 0

  return (
    <div className="space-y-6">
      {showTour && <DashboardTour action={markTourSeenAction} />}

      <PageHeader
        title="Hoy"
        subtitle={todayMediumArt()}
        icon={<LayoutDashboard className="h-6 w-6" aria-hidden="true" />}
      />

      {showChecklist && (
        <OnboardingChecklist
          state={checklistState}
          tenantSlug={tenant.slug}
          appUrl={appUrl}
          action={markPublicLinkSharedAction}
          onDismiss={markChecklistDismissedAction}
          staffRole={role}
        />
      )}

      {/* H010 (auditoría de coherencia, 2026-09-10): acá había tres tarjetas de
          métrica, y dos de ellas —"Cobrado hoy" y "Deudas"— eran el mismo
          componente con el mismo dato que Caja muestra un click más allá. Hoy
          dejó de ser un tablero de números y pasó a ser la pantalla operativa:
          qué falta jugar, qué hay que resolver, y qué pasó sin el dueño. La
          ocupación sobrevive como subtítulo del bloque de turnos, que es el
          único lugar donde ese porcentaje significa algo. */}
      <div className="card-entrance">
        <ProximosTurnos courts={upcoming} occupancy={numbers.occupancy} dayIsClosed={dayIsClosed} />
      </div>

      <div className="card-entrance" style={{ animationDelay: '80ms' }}>
        <NeedsAttention items={needsAttention} />
      </div>

      <div className="card-entrance" style={{ animationDelay: '160ms' }}>
        <WhileYouWereAway items={whileYouWereAway} />
      </div>
    </div>
  )
}
