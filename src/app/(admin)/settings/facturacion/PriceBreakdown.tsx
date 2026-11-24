import { formatArs, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PriceBreakdown as Breakdown } from '@/modules/billing/pricing'

import styles from './subscription.module.css'

/** Importe que se debita por el ciclo elegido. */
export function CycleTotal({ breakdown }: { breakdown: Breakdown }) {
  const annual = breakdown.cycle === 'annual'
  return (
    <div className={styles.total}>
      <p>
        <strong>{formatArs(breakdown.chargePerCycleCents)}</strong>{' '}
        <span>por {annual ? 'año' : 'mes'}</span>
      </p>
      {annual && <small>Equivale a {formatArs(breakdown.monthlyEffectiveCents)} por mes.</small>}
    </div>
  )
}

export function PriceBreakdown({
  breakdown,
  className,
  receipt = false,
}: {
  breakdown: Breakdown
  className?: string
  receipt?: boolean
}) {
  const {
    firstCourtCents,
    extraCourts,
    extraCourtUnitCents,
    extraCourtsTotalCents,
    billedCourts,
    planMonthlyListCents,
    plusPerCourtCents,
    plusMonthlyListCents,
    monthlyListCents,
    monthlyEffectiveCents,
    chargePerCycleCents,
    annualDiscountBps,
    annualSavingsCents,
    cycle,
  } = breakdown
  const annual = cycle === 'annual'
  const courts = `${billedCourts} ${billedCourts === 1 ? 'cancha' : 'canchas'}`

  return (
    <div
      className={cn(
        receipt ? styles.items : 'rounded-lg border border-border bg-background/40 p-4',
        className,
      )}
    >
      {annual && receipt && <p className={styles.itemsLabel}>Detalle por mes</p>}
      <dl className="space-y-2.5">
        {breakdown.byCourtCount ? (
          <BreakdownRow label={`TurnoGol · ${courts}`} value={formatArs(planMonthlyListCents)} />
        ) : firstCourtCents === extraCourtUnitCents || extraCourts === 0 ? (
          <BreakdownRow
            label={`${courts} × ${formatArs(firstCourtCents)}`}
            value={formatArs(planMonthlyListCents)}
          />
        ) : (
          <>
            <BreakdownRow label="1ª cancha" value={formatArs(firstCourtCents)} />
            <BreakdownRow
              label={`${extraCourts} ${extraCourts === 1 ? 'cancha más' : 'canchas más'} × ${formatArs(extraCourtUnitCents)}`}
              value={formatArs(extraCourtsTotalCents)}
            />
          </>
        )}
        {plusMonthlyListCents > 0 && (
          <BreakdownRow
            label="Asistente de WhatsApp"
            detail={
              breakdown.byCourtCount ? undefined : `${courts} × ${formatArs(plusPerCourtCents)}`
            }
            value={formatArs(plusMonthlyListCents)}
          />
        )}
        {annual && (
          // El porcentaje NUNCA se escribe a mano: sale de `annual_discount_bps`
          // (1000 = 10%). Cuando el dueño lo mueva, este texto se mueve solo.
          <BreakdownRow
            label={`Descuento anual (${formatPct(annualDiscountBps / 100)})`}
            value={`− ${formatArs(monthlyListCents - monthlyEffectiveCents)}`}
            tone="discount"
          />
        )}

        {!receipt && (
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
            <dt className="text-sm font-medium text-foreground">Por mes</dt>
            <dd className="font-display text-3xl font-bold tabular-nums text-foreground">
              {formatArs(monthlyEffectiveCents)}
            </dd>
          </div>
        )}
      </dl>

      {annual && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {!receipt && (
            <>
              Se cobra{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {formatArs(chargePerCycleCents)}
              </span>{' '}
              una vez al año.{' '}
            </>
          )}
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            Ahorrás {formatArs(annualSavingsCents)}
          </span>{' '}
          al año.
        </p>
      )}
    </div>
  )
}

/** Fila del desglose: concepto a la izquierda, plata a la derecha (MASTER §6.6). */
function BreakdownRow({
  label,
  detail,
  value,
  tone = 'default',
}: {
  label: string
  detail?: string
  value: string
  tone?: 'default' | 'discount'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0 text-sm text-muted-foreground">
        {label}
        {detail && <small className="block text-xs">{detail}</small>}
      </dt>
      <dd
        className={cn(
          'shrink-0 text-right text-sm font-medium tabular-nums',
          tone === 'discount' ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
