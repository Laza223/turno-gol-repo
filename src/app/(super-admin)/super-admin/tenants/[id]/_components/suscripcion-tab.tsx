import { formatArs } from '@/lib/format'
import type { PlanSummary, TenantDetail } from '@/modules/super-admin/tenants.service'
import { TenantStatusBadge } from '../../_components/status-badge'
import { formatDateArt, formatDateTimeArt } from '../../_components/format'
import { Card, Dt } from './detail-primitives'

/**
 * Tab "Suscripción" del detalle de tenant: estado de la suscripción SaaS +
 * dunning/pagos. Presentacional puro.
 */
export function SuscripcionTab({ detail, plans }: { detail: TenantDetail; plans: PlanSummary[] }) {
  const sub = detail.subscription
  if (!sub) {
    return (
      <Card title="Suscripción">
        <p className="text-sm text-muted-foreground">
          El complejo no tiene fila en tenant_subscriptions (todavía no inició la
          suscripción SaaS).
        </p>
      </Card>
    )
  }
  const pendingPlanName = sub.pendingPlanChange
    ? plans.find((p) => p.id === sub.pendingPlanChange)?.name ?? sub.pendingPlanChange
    : null
  return (
    <div className="space-y-4">
      <Card title="Estado de la suscripción">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Estado">
            <TenantStatusBadge status={sub.status} />
          </Dt>
          <Dt label="Plan">
            {sub.planName ?? sub.planId}
            {sub.priceMonthly != null && (
              <span className="text-muted-foreground"> · {formatArs(sub.priceMonthly)}/mes</span>
            )}
          </Dt>
          <Dt label="Ciclo">{sub.billingCycle === 'annual' ? 'Anual' : 'Mensual'}</Dt>
          <Dt label="Período actual">
            {formatDateArt(sub.currentPeriodStart)} → {formatDateArt(sub.currentPeriodEnd)}
          </Dt>
          <Dt label="Preapproval MP">{sub.mpSubscriptionId ?? '—'}</Dt>
          {pendingPlanName && (
            <Dt label="Cambio de plan pendiente">
              {pendingPlanName}
              {sub.pendingChangeAt
                ? ` (aplica ${formatDateArt(sub.pendingChangeAt)})`
                : ' (espera pago de proración)'}
            </Dt>
          )}
        </dl>
      </Card>

      <Card title="Dunning y pagos">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Último pago">{formatDateTimeArt(sub.lastPaymentAt)}</Dt>
          <Dt label="Último pago fallido">{formatDateTimeArt(sub.lastPaymentFailedAt)}</Dt>
          <Dt label="Dunning iniciado">{formatDateTimeArt(sub.dunningStartedAt)}</Dt>
          {sub.canceledAt && (
            <Dt label="Cancelada">
              {formatDateTimeArt(sub.canceledAt)}
              {sub.cancellationReason && (
                <span className="text-muted-foreground"> — “{sub.cancellationReason}”</span>
              )}
            </Dt>
          )}
          {sub.scheduledDeletionAt && (
            <Dt label="Eliminación programada">
              <span className="text-red-600 dark:text-red-400">{formatDateTimeArt(sub.scheduledDeletionAt)}</span>
            </Dt>
          )}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          No existe tabla de pagos SaaS en v1: el historial se reduce a los anclajes de
          la suscripción (último pago / fallo / dunning). Los eventos completos están en
          la pestaña Actividad (audit trail).
        </p>
      </Card>
    </div>
  )
}
