import { formatArs } from '@/lib/format'
import { buildPriceBreakdown, effectivePlusPerCourtCents } from '@/modules/billing/pricing'
import type { TenantDetail } from '@/modules/super-admin/tenants.service'
import { TenantStatusBadge } from '../../../_components/tenant-status-visual'
import { TONE_TEXT } from '@/lib/status-tone'
import { formatDateWithYear, formatShortDateTime } from '../../../_components/sa-format'
import { Card, Dt } from './detail-primitives'

/**
 * Tab "Suscripción" del detalle de complejo: estado de la suscripción +
 * cobros y reintentos. Presentacional puro.
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
          El complejo todavía no inició la suscripción a TurnoGol.
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

  // Plus EFECTIVO que se factura (no el flag): el mismo número que va al débito.
  const plusPerCourtCents = effectivePlusPerCourtCents(sub.plusEnabled, sub.plusPricePerCourtCents)

  const breakdown = pricing
    ? buildPriceBreakdown({
        billedCourts: sub.billedCourts,
        cycle: sub.billingCycle,
        plusPerCourtCents,
        ...pricing,
      })
    : null
  const pending =
    pricing && sub.pendingBilledCourts !== null && sub.pendingBilledCourts >= 1
      ? buildPriceBreakdown({
          billedCourts: sub.pendingBilledCourts,
          cycle: sub.billingCycle,
          plusPerCourtCents,
          ...pricing,
        })
      : null

  return (
    <div className="space-y-3 lg:space-y-4">
      <Card title="Estado de la suscripción">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Estado">
            <TenantStatusBadge status={sub.status} />
          </Dt>
          <Dt label="Canchas facturadas">
            <span className="tabular-nums">{sub.billedCourts}</span>
            {breakdown && breakdown.extraCourts > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · 1ª {formatArs(breakdown.firstCourtCents)} + {breakdown.extraCourts} ×{' '}
                {formatArs(breakdown.extraCourtUnitCents)}
              </span>
            )}
            {breakdown && breakdown.plusMonthlyListCents > 0 && (
              <span className="block text-muted-foreground">
                Plus: {breakdown.billedCourts} cancha{breakdown.billedCourts === 1 ? '' : 's'} ×{' '}
                {formatArs(breakdown.plusPerCourtCents)}
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
            {formatDateWithYear(sub.currentPeriodStart)} →{' '}
            {formatDateWithYear(sub.currentPeriodEnd)}
          </Dt>
          <Dt label="Suscripción de MercadoPago">{sub.mpSubscriptionId ?? '—'}</Dt>
          {sub.pendingBilledCourts !== null && (
            <Dt label="Cambio pendiente">
              Pasa a {sub.pendingBilledCourts} cancha{sub.pendingBilledCourts === 1 ? '' : 's'}
              {pending && ` (${formatArs(pending.monthlyEffectiveCents)}/mes)`}
              {sub.pendingChangeAt
                ? ` el ${formatDateWithYear(sub.pendingChangeAt)}`
                : ' al cierre del período'}
            </Dt>
          )}
        </dl>
      </Card>

      <Card title="Cobros y reintentos">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Último pago">{formatShortDateTime(sub.lastPaymentAt)}</Dt>
          <Dt label="Último cobro fallido">{formatShortDateTime(sub.lastPaymentFailedAt)}</Dt>
          <Dt label="Reintentos desde">{formatShortDateTime(sub.dunningStartedAt)}</Dt>
          {sub.canceledAt && (
            <Dt label="Cancelada">
              {formatShortDateTime(sub.canceledAt)}
              {sub.cancellationReason && (
                <span className="text-muted-foreground"> — “{sub.cancellationReason}”</span>
              )}
            </Dt>
          )}
          {sub.scheduledDeletionAt && (
            <Dt label="Eliminación programada">
              <span className={TONE_TEXT.destructive}>
                {formatShortDateTime(sub.scheduledDeletionAt)}
              </span>
            </Dt>
          )}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Por ahora no se guarda un listado de pagos: se muestran el último pago, el último cobro
          fallido y desde cuándo se reintenta. Los movimientos completos están en la pestaña
          Historial.
        </p>
      </Card>
    </div>
  )
}
