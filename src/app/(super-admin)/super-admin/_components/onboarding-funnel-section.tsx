import { TrendingUp } from 'lucide-react'
import type { OnboardingFunnelData } from '@/modules/super-admin/dashboard.service'

/**
 * Embudo del wizard de onboarding (plan de refactor §I, Fase 7): la pregunta
 * que justifica todo el rediseño — ¿cuántos llegan a cada paso, y de los que
 * terminan, cuántos activan (primera reserva ONLINE) y en cuántos días?
 *
 * `analytics_events` era write-only hasta acá: ni un solo `SELECT` fuera de la
 * purga de retención. Esta es la primera vista que LEE la tabla.
 */
export function OnboardingFunnelSection({ data }: { data: OnboardingFunnelData }) {
  const step1 = data.stepCompleted[0]?.tenants ?? 0

  return (
    <section className="rounded-lg border border-border bg-card shadow-xs">
      <h2 className="flex items-center gap-2 border-b border-border px-6 py-4 text-base font-semibold text-foreground">
        <span className="text-violet-600 dark:text-violet-400">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
        </span>
        Embudo de onboarding
        <span className="text-xs font-normal text-muted-foreground">
          (últimos {data.windowDays} días)
        </span>
      </h2>

      <div className="px-6 py-4">
        {step1 === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Sin actividad de onboarding en la ventana. {data.startedViews} vista(s) del paso 1 sin
            tenant creado todavía.
          </p>
        ) : (
          <div className="space-y-2">
            {data.stepCompleted.map((s) => {
              const pct = step1 > 0 ? Math.round((s.tenants / step1) * 100) : 0
              return (
                <div key={s.step} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-foreground">
                    {s.stepName}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                    {s.tenants} ({pct}%)
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Vistas paso 1 (sin tenant)</dt>
            <dd className="font-medium tabular-nums text-foreground">{data.startedViews}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Completaron el wizard</dt>
            <dd className="font-medium tabular-nums text-foreground">{data.completedTenants}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cargaron turno en el wizard</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {data.firstBookingInWizard}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Compartieron el link</dt>
            <dd className="font-medium tabular-nums text-foreground">{data.linkShared}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Conectaron MercadoPago</dt>
            <dd className="font-medium tabular-nums text-foreground">{data.mpConnected}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Activaciones (1ª reserva online)</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {data.activationEvents}
              {data.medianDaysToActivation != null && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  · mediana {data.medianDaysToActivation.toFixed(1)}d
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
