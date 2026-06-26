import { redirect } from 'next/navigation'
import { CalendarCheck, Banknote, Users, LayoutDashboard } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { MetricCard } from '@/components/dashboard/metric-card'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { PageHeader } from '@/components/admin/PageHeader'
import Reveal from '@/components/site/Reveal'
import { getDashboardMetrics, getChecklistState } from './queries'

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function DashboardPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const allDone =
    tenant.settings.onboarding_completed === true &&
    tenant.settings.public_link_shared === true

  const [metrics, checklistState] = await Promise.all([
    getDashboardMetrics(tenant.id),
    getChecklistState(tenant.id, tenant.settings, !!tenant.mpConnectedAt),
  ])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const today = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inicio"
        subtitle={today}
        icon={<LayoutDashboard className="h-6 w-6" aria-hidden="true" />}
      />

      {!allDone && (
        <Reveal>
          <OnboardingChecklist
            state={checklistState}
            tenantSlug={tenant.slug}
            appUrl={appUrl}
          />
        </Reveal>
      )}

      <div>
        <h2 className="mb-3 text-xl font-semibold text-foreground">Hoy</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Reveal delay={0}>
            <MetricCard
              label="Turnos hoy"
              value={String(metrics.bookingsToday)}
              icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />}
            />
          </Reveal>
          <Reveal delay={80}>
            <MetricCard
              label="Revenue hoy"
              value={formatARS(metrics.revenueTodayCents)}
              icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
              sub="Reservas confirmadas y completadas"
            />
          </Reveal>
          <Reveal delay={160}>
            <MetricCard
              label="Abonados activos"
              value={String(metrics.activeAbonados)}
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
            />
          </Reveal>
        </div>
      </div>
    </div>
  )
}
