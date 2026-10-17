import type { OnboardingFunnelData } from '@/modules/super-admin/dashboard.service'
import { PulsoSection } from './pulso/pulso-section'

/**
 * Embudo del asistente de alta: ¿cuántos complejos llegan a cada paso, y de los
 * que terminan, cuántos activan (primera reserva ONLINE) y en cuántos días?
 */
export function OnboardingFunnelSection({ data }: { data: OnboardingFunnelData | null }) {
  const step1 = data?.stepCompleted[0]?.tenants ?? 0

  return (
    <PulsoSection
      title={data ? `Alta de complejos (últimos ${data.windowDays} días)` : 'Alta de complejos'}
    >
      {!data ? (
        <p className="py-2 text-sm text-muted-foreground">
          No se pudo leer ahora, recargá en un rato.
        </p>
      ) : step1 === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Sin altas en el período.{' '}
          {data.startedViews === 1
            ? '1 visita al primer paso sin complejo creado todavía.'
            : `${data.startedViews} visitas al primer paso sin complejo creado todavía.`}
        </p>
      ) : (
        <ol className="space-y-2">
          {data.stepCompleted.map((s) => {
            const pct = Math.round((s.tenants / step1) * 100)
            return (
              <li key={s.step} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm text-foreground">{s.stepName}</span>
                <div
                  role="img"
                  aria-label={`${s.stepName}: ${s.tenants} complejos, ${pct} % de los que empezaron`}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {s.tenants} ({pct} %)
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {data && (
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Visitas al primer paso (sin complejo)</dt>
            <dd className="font-medium tabular-nums text-foreground">{data.startedViews}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Terminaron el asistente</dt>
            <dd className="font-medium tabular-nums text-foreground">{data.completedTenants}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cargaron un turno en el asistente</dt>
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
            <dt className="text-xs text-muted-foreground">Recibieron su primera reserva online</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {data.activationEvents}
              {data.medianDaysToActivation != null && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  · mediana {data.medianDaysToActivation.toFixed(1).replace('.', ',')} días
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}
    </PulsoSection>
  )
}
