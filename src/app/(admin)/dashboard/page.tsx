import { redirect } from 'next/navigation'
import {
  Banknote,
  CalendarCheck,
  Clock,
  LayoutDashboard,
  ShoppingBag,
} from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { getDailyClose } from '@/modules/cashflow/daily-close.service'
import { listProducts } from '@/modules/canteen/canteen.service'
import { listCourts } from '@/modules/courts/court.service'
import { MetricCard } from '@/components/dashboard/metric-card'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { DashboardTour } from '@/components/dashboard/dashboard-tour'
import { UpcomingBookings } from '@/components/dashboard/upcoming-bookings'
import { DashboardCanteenButton } from '@/components/dashboard/DashboardCanteenButton'
import { QuickBookingButton } from '@/components/booking/QuickBookingButton'
import { PageHeader } from '@/components/admin/PageHeader'
import { formatArs } from '@/lib/format'
import { getDashboardData, getChecklistState } from './queries'
import { markPublicLinkSharedAction, markTourSeenAction, markChecklistDismissedAction } from './actions'
import { sellTicketAction } from '@/app/(admin)/caja/cantina/actions'
import {
  createBookingAction,
  checkSlotAvailabilityAction,
  searchBookingPlayersAction,
} from '@/app/(admin)/reservas/actions'

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

  const [data, checklistState, products, courts, staffRole] = await Promise.all([
    getDashboardData({
      id: tenant.id,
      openingHours: tenant.openingHours,
      closedDates: tenant.closedDates,
      closesNextDay: tenant.closesNextDay,
    }),
    getChecklistState(tenant.id, tenant.settings, !!tenant.mpConnectedAt),
    withTenantContext(tenant.id, (tx) => listProducts(tenant.id, tx)),
    withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx)),
    getStaffRole(tenant.id, user.staffUserId),
  ])

  // Mismo criterio que /caja/cantina: caja del día cerrada → venta rápida
  // deshabilitada (bug: este botón no lo chequeaba y dejaba armar el ticket
  // entero antes de que el servidor lo rechace).
  const dailyClose = await withTenantContext(tenant.id, (tx) => getDailyClose(tenant.id, data.date, tx))
  const saleDisabled = dailyClose !== null

  // Todos los pasos de la checklist, no solo 2 de 7 (bug: antes el complejo
  // podía dar "por terminado" el onboarding con canchas/horarios sin cargar).
  const allDone = Object.values(checklistState).every(Boolean)
  const showChecklist = !allDone && !tenant.settings.checklist_dismissed_at
  const showTour =
    tenant.settings.onboarding_completed === true && !tenant.settings.admin_tour_seen_at

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const { caja, occupancy, pendingDeposits, canteenSales } = data

  const cajaValue =
    caja.balanceCents < 0 ? (
      <span className="text-red-700 dark:text-red-400">−{formatArs(-caja.balanceCents)}</span>
    ) : (
      formatArs(caja.balanceCents)
    )

  // Bug: con 0 canchas online (o todo bloqueado) el denominador da 0 pero el
  // numerador puede seguir contando reservas reales — evitamos el "N de 0"
  // literal y el "0% de ocupación" engañoso mostrando solo el numerador.
  const noAvailability = !data.dayIsClosed && occupancy.available === 0
  const turnosValue = data.dayIsClosed
    ? 'Cerrado'
    : noAvailability
      ? `${occupancy.occupied}`
      : `${occupancy.occupied} de ${occupancy.available}`
  const turnosSub = data.dayIsClosed
    ? 'Sin horarios para hoy'
    : noAvailability
      ? 'Sin turnos disponibles hoy'
      : `${occupancy.pct}% de ocupación${occupancy.blocked > 0 ? ` · ${occupancy.blocked} bloqueados` : ''}`

  return (
    <div className="space-y-6">
      {showTour && <DashboardTour action={markTourSeenAction} />}

      <PageHeader
        title="Inicio"
        subtitle={todayMediumArt()}
        icon={<LayoutDashboard className="h-6 w-6" aria-hidden="true" />}
        actions={
          <div className="flex items-center gap-2">
            <QuickBookingButton
              courts={courts}
              createBookingAction={createBookingAction}
              checkSlotAvailabilityAction={checkSlotAvailabilityAction}
              searchPlayersAction={searchBookingPlayersAction}
            />
            <DashboardCanteenButton
              products={products}
              sellTicketAction={sellTicketAction}
              saleDisabled={saleDisabled}
            />
          </div>
        }
      />

      {showChecklist && (
        <OnboardingChecklist
          state={checklistState}
          tenantSlug={tenant.slug}
          appUrl={appUrl}
          action={markPublicLinkSharedAction}
          onDismiss={markChecklistDismissedAction}
          staffRole={staffRole ?? 'manager'}
        />
      )}

      <div className="card-entrance" style={{ animationDelay: '240ms' }}>
        <UpcomingBookings
          upcoming={data.upcoming}
          playedToday={data.playedToday}
          dayIsClosed={data.dayIsClosed}
          nowHhmm={data.nowHhmm}
          openHhmm={data.openHhmm}
          closesNextDay={data.closesNextDay}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="card-entrance order-first col-span-2 lg:order-0 lg:col-span-1">
          <MetricCard
            label="Caja del día"
            value={cajaValue}
            sub={`Ingresos: ${formatArs(caja.incomeCents)} · Egresos: ${formatArs(caja.expenseCents)}`}
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
            href="/grilla"
          />
        </div>
        <div className="card-entrance" style={{ animationDelay: '160ms' }}>
          <MetricCard
            label="Ventas de cantina"
            value={formatArs(canteenSales.amountCents)}
            sub={`${canteenSales.count} ${canteenSales.count === 1 ? 'venta' : 'ventas'} hoy`}
            icon={<ShoppingBag className="h-4 w-4" aria-hidden="true" />}
            href="/caja/cantina"
          />
        </div>
      </div>

      {pendingDeposits.count > 0 && (
        <div className="card-entrance rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10" style={{ animationDelay: '320ms' }}>
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <CalendarCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {pendingDeposits.count}{' '}
                {pendingDeposits.count === 1 ? 'seña pendiente' : 'señas pendientes'} de confirmación
              </p>
              <p className="text-xs">
                Total:{' '}
                <span className="font-semibold tabular-nums">
                  {formatArs(pendingDeposits.amountCents)}
                </span>
                . Confirmá los pagos desde la lista de reservas.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
