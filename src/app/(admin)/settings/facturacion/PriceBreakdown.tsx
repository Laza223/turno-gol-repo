import type { ReactNode } from 'react'
import { formatArs, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PriceBreakdown as Breakdown } from '@/modules/billing/pricing'

/**
 * De dónde sale el número grande: "1ª cancha $47.000 + 4 canchas más ×
 * $30.000". Es la única explicación del precio que ve el dueño, así que no
 * calcula NADA: todos los números llegan ya resueltos por
 * `buildPriceBreakdown`, para que la pantalla y el cobro no puedan divergir.
 *
 * Puro y sin estado a propósito: la confirmación de `/canchas` ("si prendés
 * esta cancha, tu cuota pasa a X") necesita exactamente este bloque, y lo
 * único que las dos pantallas tienen que compartir es esto.
 *
 * Sin `'use client'`: lo monta un componente cliente (la cuota) y podría
 * montarlo un Server Component; sin directiva sirve para los dos.
 */
export function PriceBreakdown({
  breakdown,
  className,
}: {
  breakdown: Breakdown
  className?: string
}) {
  const {
    firstCourtCents,
    extraCourts,
    extraCourtUnitCents,
    extraCourtsTotalCents,
    monthlyListCents,
    monthlyEffectiveCents,
    chargePerCycleCents,
    annualDiscountBps,
    annualSavingsCents,
    cycle,
  } = breakdown
  const annual = cycle === 'annual'

  return (
    <div className={cn('rounded-lg border border-border bg-background/40 p-4', className)}>
      <dl className="space-y-2.5">
        <BreakdownRow label="1ª cancha" value={formatArs(firstCourtCents)} />
        {extraCourts > 0 && (
          <BreakdownRow
            label={`${extraCourts} ${extraCourts === 1 ? 'cancha más' : 'canchas más'} × ${formatArs(extraCourtUnitCents)}`}
            value={formatArs(extraCourtsTotalCents)}
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

        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <dt className="text-sm font-medium text-foreground">Por mes</dt>
          {/* MASTER §3: numeral clave. El total es lo único display de la card. */}
          <dd className="font-display text-3xl font-bold tabular-nums text-foreground">
            {formatArs(monthlyEffectiveCents)}
          </dd>
        </div>
      </dl>

      {annual && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Se cobra{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {formatArs(chargePerCycleCents)}
          </span>{' '}
          una vez al año.{' '}
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            Ahorrás {formatArs(annualSavingsCents)}
          </span>{' '}
          contra pagarlo mes a mes.
        </p>
      )}
    </div>
  )
}

/** Fila del desglose: concepto a la izquierda, plata a la derecha (MASTER §6.6). */
function BreakdownRow({
  label,
  value,
  tone = 'default',
}: {
  label: ReactNode
  value: string
  tone?: 'default' | 'discount'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-right text-sm font-medium tabular-nums',
          tone === 'discount' ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
