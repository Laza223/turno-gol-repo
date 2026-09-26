import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import { cn } from '@/lib/utils'
import type { DaySummary } from '@/modules/cashflow/cashflow.types'

type Figure = { label: string; cents: number; out?: boolean }

function Figures({ items, className }: { items: Figure[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-3 gap-x-6 gap-y-3 text-sm sm:flex sm:gap-x-8', className)}>
      {items.map(({ label, cents, out }) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd
            className={cn(
              'font-semibold tabular-nums',
              out ? 'text-red-700 dark:text-red-400' : 'text-foreground',
            )}
          >
            {out ? `−${formatArs(cents)}` : formatArs(cents)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * El cierre de la noche, automático: cuánto entró, por dónde y de qué. Es lo
 * que el dueño mira desde el celular. Sin contar billetes: el arqueo manual se
 * eliminó el 2026-09-11 y nadie lo usaba (decisión del dueño, 2026-09-25).
 *
 * Todo sale de `getDaySummary`. El desglose por método es `collectedByMethod`,
 * que suma exactamente `collected` (el neto `byMethod` contesta otra pregunta,
 * ver `.claude/rules/caja.md`). Los tres métodos van siempre, aunque den cero,
 * para que el dueño no tenga que buscar dónde quedó cada uno.
 */
export function NightSummary({ heading, summary }: { heading: string; summary: DaySummary }) {
  const byMethod = summary.collectedByMethod
  const methods: Figure[] = [
    { label: METHOD_LABELS.cash, cents: byMethod.cash ?? 0 },
    { label: METHOD_LABELS.mercadopago, cents: byMethod.mercadopago ?? 0 },
    { label: METHOD_LABELS.transfer, cents: byMethod.transfer ?? 0 },
    ...((byMethod.other ?? 0) > 0
      ? [{ label: METHOD_LABELS.other, cents: byMethod.other ?? 0 }]
      : []),
  ]

  const turnos = summary.byCategory.booking ?? 0
  const cantina = summary.byCategory.product_sale ?? 0
  // Torneos, otros ingresos y ajustes: lo que entró y no es ni turno ni cantina.
  const otros = summary.collected - turnos - cantina
  const origins: Figure[] = [
    { label: 'Turnos', cents: turnos },
    { label: 'Cantina', cents: cantina },
    ...(otros > 0 ? [{ label: 'Otros', cents: otros }] : []),
    ...(summary.totalExpense > 0
      ? [{ label: 'Gastos', cents: summary.totalExpense, out: true }]
      : []),
  ]

  return (
    <section
      aria-label="Resumen del día"
      className="card-premium flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between"
    >
      <div>
        <p className="text-sm text-muted-foreground">{heading}</p>
        <p className="font-display text-3xl font-bold tabular-nums tracking-tight text-foreground">
          {formatArs(summary.collected)}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
        <Figures items={methods} />
        <Figures
          items={origins}
          className="border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0"
        />
      </div>
    </section>
  )
}
