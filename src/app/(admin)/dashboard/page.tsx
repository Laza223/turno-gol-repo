import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Banknote,
  CalendarCheck,
  CalendarDays,
  Clock,
  LayoutDashboard,
  UserX,
} from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { MetricCard } from '@/components/dashboard/metric-card'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { UpcomingBookings } from '@/components/dashboard/upcoming-bookings'
import { PageHeader } from '@/components/admin/PageHeader'
import { formatArs } from '@/lib/format'
import { getDashboardData, getChecklistState } from './queries'

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
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const allDone =
    tenant.settings.onboarding_completed === true &&
    tenant.settings.public_link_shared === true

  const [data, checklistState] = await Promise.all([
    getDashboardData({
      id: tenant.id,
      openingHours: tenant.openingHours,
      closedDates: tenant.closedDates,
      closesNextDay: tenant.closesNextDay,
    }),
    getChecklistState(tenant.id, tenant.settings, !!tenant.mpConnectedAt),
  ])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const { caja, occupancy, pendingDeposits, blockedPlayers } = data

  const cajaValue =
    caja.balanceCents < 0 ? (
      <span className="text-red-700 dark:text-red-400">−{formatArs(-caja.balanceCents)}</span>
    ) : (
      formatArs(caja.balanceCents)
    )

  const turnosValue = data.dayIsClosed ? 'Cerrado' : `${occupancy.occupied} de ${occupancy.available}`
  const turnosSub = data.dayIsClosed
    ? 'Sin horarios para hoy'
    : `${occupancy.pct}% de ocupación${occupancy.blocked > 0 ? ` · ${occupancy.blocked} bloqueados` : ''}`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inicio"
        subtitle={todayMediumArt()}
        icon={<LayoutDashboard className="h-6 w-6" aria-hidden="true" />}
        actions={
          <Link
            href="/grilla"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Ir a la grilla
          </Link>
        }
      />

      {!allDone && (
        <OnboardingChecklist
          state={checklistState}
          tenantSlug={tenant.slug}
          appUrl={appUrl}
        />
      )}

      {/* 4 KPIs, orden fijo §2: la plata primero (serial position §9). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard
          label="Caja de hoy"
          value={cajaValue}
          icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
          sub={`Ingresos ${formatArs(caja.incomeCents)} · Egresos ${formatArs(caja.expenseCents)}`}
          accent="emerald"
          href="/caja"
          ariaLabel={`Caja de hoy: ${caja.balanceCents < 0 ? 'menos ' : ''}${formatArs(Math.abs(caja.balanceCents))} — ver caja`}
        />
        <MetricCard
          label="Turnos hoy"
          value={turnosValue}
          icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />}
          sub={turnosSub}
          accent="slate"
          href="/grilla"
          ariaLabel={`Turnos hoy: ${turnosValue} — ver grilla`}
        />
        <MetricCard
          label="Esperando seña"
          value={String(pendingDeposits.count)}
          icon={<Clock className="h-5 w-5" aria-hidden="true" />}
          sub={
            pendingDeposits.count > 0
              ? `${formatArs(pendingDeposits.amountCents)} en señas por acreditar`
              : 'Sin pendientes'
          }
          accent="amber"
          href="/reservas?status=pending_payment"
          ariaLabel={`Esperando seña: ${pendingDeposits.count} — ver reservas pendientes`}
        />
        <MetricCard
          label="Jugadores bloqueados"
          value={String(blockedPlayers)}
          icon={<UserX className="h-5 w-5" aria-hidden="true" />}
          sub={blockedPlayers > 0 ? 'Por ausencias reiteradas u otros motivos' : 'Nadie bloqueado'}
          accent="red"
          href="/jugadores"
          ariaLabel={`Jugadores bloqueados: ${blockedPlayers} — ver jugadores`}
        />
      </div>

      <UpcomingBookings
        upcoming={data.upcoming}
        playedToday={data.playedToday}
        dayIsClosed={data.dayIsClosed}
        nowHhmm={data.nowHhmm}
        openHhmm={data.openHhmm}
        closesNextDay={data.closesNextDay}
      />
    </div>
  )
}
