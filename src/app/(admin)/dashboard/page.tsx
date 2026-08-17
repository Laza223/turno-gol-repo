import { redirect } from 'next/navigation'
import { Banknote, Clock, LayoutDashboard } from 'lucide-react'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import { daySlotsFor } from '@/lib/dashboard/day-bookings'
import { getHoyData } from '@/modules/home/home.service'
import { compareToLastWeek } from '@/modules/home/home.lib'
import { MetricCard } from '@/components/dashboard/metric-card'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { DashboardTour } from '@/components/dashboard/dashboard-tour'
import { WhileYouWereAway } from '@/components/dashboard/WhileYouWereAway'
import { NeedsAttention } from '@/components/dashboard/NeedsAttention'
import { PageHeader } from '@/components/admin/PageHeader'
import { formatArs } from '@/lib/format'
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

function comparisonSub(collectedCents: number, lastWeekCents: number): string {
  const cmp = compareToLastWeek(collectedCents, lastWeekCents)
  if (cmp.deltaPct === null) return 'Sin dato de la semana pasada'
  if (cmp.direction === 'flat') return 'Igual que la semana pasada'
  const pct = Math.abs(Math.round(cmp.deltaPct))
  return cmp.direction === 'up' ? `↑ ${pct}% vs. semana pasada` : `↓ ${pct}% vs. semana pasada`
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
  const { numbers, whileYouWereAway, needsAttention } = data

  // Bug preexistente (heredado de /dashboard v1): con 0 canchas online (o todo
  // bloqueado) el denominador da 0 pero el numerador puede seguir contando
  // reservas reales — evitamos el "N de 0" literal y el "0% de ocupación"
  // engañoso mostrando solo el numerador. dayIsClosed se recalcula acá (pura,
  // sin DB) porque getHoyData no distingue "día cerrado" de "0 disponible".
  const dayIsClosed =
    daySlotsFor(date, tenant.openingHours, tenant.closedDates ?? [], tenant.closesNextDay)
      .length === 0
  const noAvailability = !dayIsClosed && numbers.occupancy.available === 0
  const turnosValue = dayIsClosed
    ? 'Cerrado'
    : noAvailability
      ? `${numbers.occupancy.occupied}`
      : `${numbers.occupancy.occupied} de ${numbers.occupancy.available}`
  const turnosSub = dayIsClosed
    ? 'Sin horarios para hoy'
    : noAvailability
      ? 'Sin turnos disponibles hoy'
      : `${numbers.occupancy.pct}% de ocupación${numbers.occupancy.blocked > 0 ? ` · ${numbers.occupancy.blocked} bloqueados` : ''}`

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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="card-entrance order-first col-span-2 lg:order-0 lg:col-span-1">
          <MetricCard
            label="Cobrado hoy"
            value={formatArs(numbers.collectedTodayCents)}
            sub={comparisonSub(
              numbers.collectedTodayCents,
              numbers.collectedSameWeekdayLastWeekCents,
            )}
            icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
            href="/caja"
          />
        </div>
        <div className="card-entrance" style={{ animationDelay: '80ms' }}>
          <MetricCard
            label="Turnos de hoy"
            value={turnosValue}
            sub={turnosSub}
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
            accent="slate"
            href="/grilla"
          />
        </div>
        <div className="card-entrance" style={{ animationDelay: '160ms' }}>
          <MetricCard
            label="Plata en la calle"
            value={formatArs(numbers.streetMoneyCents)}
            sub={numbers.streetMoneyCents > 0 ? 'Pendiente de cobro' : 'Nada pendiente'}
            icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
            accent={numbers.streetMoneyCents > 0 ? 'amber' : 'emerald'}
            href="/caja/deudas"
          />
        </div>
      </div>

      <div className="card-entrance" style={{ animationDelay: '240ms' }}>
        <NeedsAttention items={needsAttention} />
      </div>

      <div className="card-entrance" style={{ animationDelay: '320ms' }}>
        <WhileYouWereAway items={whileYouWereAway} />
      </div>
    </div>
  )
}
