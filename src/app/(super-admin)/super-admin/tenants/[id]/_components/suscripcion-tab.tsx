import { formatArs } from '@/lib/format'
import { buildPriceBreakdown } from '@/modules/billing/pricing'
import type { TenantDetail } from '@/modules/super-admin/tenants.service'
import { TenantStatusBadge } from '../../../_components/tenant-status-visual'
import { formatDateArt, formatDateTimeArt } from '../../_components/format'
import { Card, Dt } from './detail-primitives'

/**
 * Tab "Suscripción" del detalle de tenant: estado de la suscripción SaaS +
 * dunning/pagos. Presentacional puro.
 *
 * Desde el precio por cancha (decisión 2026-09-17) el dato útil ya no es el
 * nombre del plan — hay uno solo — sino por cuántas canchas se factura y
 * cuánto sale. El desglose sale de `buildPriceBreakdown`, la MISMA función que
 * calcula el monto que se le manda a MercadoPago, para que la pantalla y el
 * cobro no puedan divergir.
 */
export function SuscripcionTab({ detail }: { detail: TenantDetail }) {
  const sub = detail.subscription
  if (!sub) {
    return (
      <Card title="Suscripción">
        <p className="text-sm text-muted-foreground">
          El complejo no tiene fila en tenant_subscriptions (todavía no inició la suscripción SaaS).
        </p>
      </Card>
    )
  }

  // Una banda legacy (migr. 091 debería haberlas repuntado todas) no tiene
  // parámetros de precio lineal: sin ellos no hay desglose que mostrar, y
  // fabricar un monto sería peor que dejar el hueco a la vista.
  const pricing =
    sub.priceFirstCourtCents !== null &&
    sub.priceExtraCourtCents !== null &&
    sub.annualDiscountBps !== null &&
    sub.billedCourts >= 1
      ? {
          priceFirstCourtCents: sub.priceFirstCourtCents,
          priceExtraCourtCents: sub.priceExtraCourtCents,
          annualDiscountBps: sub.annualDiscountBps,
        }
      : null

  const breakdown = pricing
    ? buildPriceBreakdown({
        billedCourts: sub.billedCourts,
        cycle: sub.billingCycle,
        ...pricing,
      })
    : null
  const pending =
    pricing && sub.pendingBilledCourts !== null && sub.pendingBilledCourts >= 1
      ? buildPriceBreakdown({
          billedCourts: sub.pendingBilledCourts,
          cycle: sub.billingCycle,
          ...pricing,
        })
      : null

  return (
    <div className="space-y-4">
      <Card title="Estado de la suscripción">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Estado">
            <TenantStatusBadge status={sub.status} />
          </Dt>
          <Dt label="Canchas facturadas">
            {sub.billedCourts}
            {breakdown && breakdown.extraCourts > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · 1ª {formatArs(breakdown.firstCourtCents)} + {breakdown.extraCourts} ×{' '}
                {formatArs(breakdown.extraCourtUnitCents)}
              </span>
            )}
          </Dt>
          <Dt label="Cuota mensual">
            {breakdown ? (
              <>
                {formatArs(breakdown.monthlyEffectiveCents)}
                {breakdown.cycle === 'annual' && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {formatArs(breakdown.chargePerCycleCents)} por año
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                El plan de esta suscripción no tiene precio por cancha cargado
              </span>
            )}
          </Dt>
          <Dt label="Ciclo">{sub.billingCycle === 'annual' ? 'Anual' : 'Mensual'}</Dt>
          <Dt label="Período actual">
            {formatDateArt(sub.currentPeriodStart)} → {formatDateArt(sub.currentPeriodEnd)}
          </Dt>
          <Dt label="Preapproval MP">{sub.mpSubscriptionId ?? '—'}</Dt>
          {sub.pendingBilledCourts !== null && (
            <Dt label="Cambio pendiente">
              Pasa a {sub.pendingBilledCourts} cancha{sub.pendingBilledCourts === 1 ? '' : 's'}
              {pending && ` (${formatArs(pending.monthlyEffectiveCents)}/mes)`}
              {sub.pendingChangeAt
                ? ` el ${formatDateArt(sub.pendingChangeAt)}`
                : ' al cierre del período'}
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
              <span className="text-red-600 dark:text-red-400">
                {formatDateTimeArt(sub.scheduledDeletionAt)}
              </span>
            </Dt>
          )}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          No existe tabla de pagos SaaS en v1: el historial se reduce a los anclajes de la
          suscripción (último pago / fallo / dunning). Los eventos completos están en la pestaña
          Actividad (audit trail).
        </p>
      </Card>
    </div>
  )
}
