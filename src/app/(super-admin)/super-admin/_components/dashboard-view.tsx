import type { DashboardData } from '@/modules/super-admin/dashboard.service'
import { OnboardingFunnelSection } from './onboarding-funnel-section'
import { PulsoMoney, PulsoSignups } from './pulso/pulso-money'
import { PulsoTech } from './pulso/pulso-tech'

/**
 * Resto del Pulso con datos del dashboard (todo menos la actividad y "Pide
 * atención", que van arriba): plata y complejos, altas, embudo y salud técnica.
 * Presentacional puro — el fetch vive en la page.
 */
export function SuperAdminDashboardView({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-3 lg:space-y-6">
      <div className="grid grid-cols-1 gap-3 lg:gap-6 lg:grid-cols-2">
        <PulsoMoney mrrCents={data.mrrCents} tenantsByStatus={data.tenantsByStatus} />
        <PulsoSignups recentSignups={data.recentSignups} signupsLast7Days={data.signupsLast7Days} />
      </div>
      <OnboardingFunnelSection data={data.onboardingFunnel} />
      <PulsoTech queues={data.queues} recentWebhooks={data.recentWebhooks} />
    </div>
  )
}
