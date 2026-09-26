import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ChartLine } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatArs, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MethodReport, RevenueReport } from '@/modules/reports/report.types'
import { computeDelta, formatMethodLabel, prevMonthStr } from '@/modules/reports/report.utils'

/** 'YYYY-MM' → 'septiembre'. Mediodía UTC: el nombre sale del string, sin corrimiento de zona. */
function monthName(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('es-AR', {
    month: 'long',
    timeZone: 'UTC',
  })
}

/** Negativo como "−$ X" en rojo (DESIGN.md, The Reserved Hues Rule). */
function Signed({ cents }: { cents: number }) {
  if (cents < 0) {
    return <span className="text-red-700 dark:text-red-300">−{formatArs(-cents)}</span>
  }
  return <>{formatArs(cents)}</>
}

/**
 * Contra el mes anterior, sin mentir (decisión del dueño, 2026-09-26). El mes en
 * curso contra uno completo daba "−83%" en rojo el día 5 aunque el complejo
 * viniera bien: mientras el mes no terminó va el total del anterior como
 * referencia, y el porcentaje recién con el mes cerrado. Comparar contra los
 * mismos días del mes anterior pediría otra consulta.
 */
function VersusPrev({
  report,
  month,
  isCurrent,
}: {
  report: RevenueReport
  month: string
  isCurrent: boolean
}) {
  const prev = report.prevPeriod
  if (!prev) return null
  const prevName = monthName(prevMonthStr(month))
  const delta = isCurrent ? null : computeDelta(report.income, prev.income, `vs ${prevName}`)
  if (!delta) {
    return (
      <p>
        En todo {prevName}:{' '}
        <span className="font-medium tabular-nums text-foreground">{formatArs(prev.income)}</span>
      </p>
    )
  }
  const Arrow = delta.direction === 'up' ? ArrowUpRight : ArrowDownRight
  return (
    <p>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-medium',
          delta.direction === 'up'
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-700 dark:text-red-300',
        )}
      >
        <Arrow className="h-3.5 w-3.5" aria-hidden />
        {delta.label}
      </span>{' '}
      <span className="tabular-nums">({formatArs(prev.income)})</span>
    </p>
  )
}

/**
 * Los ajustes solo si hubo: con cero, "Saldo" repetía el número de arriba (en el
 * Vagón, cero ajustes en diez noches). Y dice "Con ajustes" y no "Saldo" porque
 * es ingresos + ajustes: los gastos de Caja no se restan (decisión del dueño,
 * 2026-09-26).
 */
function Adjustments({ report }: { report: RevenueReport }) {
  if (report.adjustment === 0) return null
  return (
    <p>
      Ajustes{' '}
      <span className="font-medium tabular-nums">
        <Signed cents={report.adjustment} />
      </span>{' '}
      · Con ajustes{' '}
      <span className="font-semibold tabular-nums text-foreground">
        <Signed cents={report.balance} />
      </span>
    </p>
  )
}

/**
 * El mes de un vistazo (variante "Canchas primero", elegida por el dueño el
 * 2026-09-26): cuánto entró y, abajo, cada cancha de la que más cobró a la que
 * menos. Contesta "¿cómo me fue?" y "¿qué cancha rinde?" sin scrollear: en la
 * notebook entran doce canchas.
 *
 * La barra compara la plata de cada cancha contra la que más cobró, como "Lo que
 * más salió" en Caja › Productos. La ocupación va en texto; en el mes en curso
 * cuenta del 1 a hoy (`occupancyEndDate`, report.utils).
 */
export function MonthBoard({
  report,
  month,
  isCurrent,
}: {
  report: RevenueReport
  month: string
  isCurrent: boolean
}) {
  const name = monthName(month)
  const ranked = [...report.byCourt].sort((a, b) => b.income - a.income)
  const top = ranked[0]?.income ?? 0

  return (
    <section aria-labelledby="mes-entro" className="card-premium p-4 sm:p-5">
      <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="mes-entro" className="text-sm text-muted-foreground">
            {isCurrent ? `Entró en ${name}, hasta hoy` : `Entró en ${name}`}
          </h2>
          <p className="font-display text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {formatArs(report.income)}
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="tabular-nums">{report.bookingCount}</span>{' '}
            {report.bookingCount === 1 ? 'turno' : 'turnos'} en el mes
          </p>
        </div>
        <div className="space-y-1 text-sm text-muted-foreground lg:text-right">
          <VersusPrev report={report} month={month} isCurrent={isCurrent} />
          <Adjustments report={report} />
        </div>
      </header>

      {ranked.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Todavía no hay turnos cobrados en {name}.
        </p>
      ) : (
        <>
          <h3 className="mt-4 text-sm font-semibold text-foreground">
            Por cancha{' '}
            <span className="font-normal text-muted-foreground">· la que más cobró primero</span>
          </h3>
          <ol
            aria-label="Canchas del mes"
            className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {ranked.map((c) => (
              <li key={c.courtId} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {c.courtName}
                  </span>
                  <span className="shrink-0 font-display text-lg font-bold tabular-nums text-foreground">
                    {formatArs(c.income)}
                  </span>
                </div>
                <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${top > 0 ? Math.max((c.income / top) * 100, 1) : 0}%` }}
                  />
                </div>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {c.bookingCount} {c.bookingCount === 1 ? 'turno' : 'turnos'} ·{' '}
                  {formatPct(c.occupancyPct)} ocupada
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

const METHOD_ORDER: MethodReport['method'][] = ['cash', 'mercadopago', 'transfer']

/**
 * Por dónde entró el mes. Efectivo, MercadoPago y transferencia van siempre,
 * aunque den cero, como en el resumen de Caja › Cuentas; "Otro" solo si hubo.
 */
export function MethodSummary({ report }: { report: RevenueReport }) {
  const total = (m: MethodReport['method']) =>
    report.byMethod.find((r) => r.method === m)?.total ?? 0
  const methods = total('other') > 0 ? [...METHOD_ORDER, 'other' as const] : METHOD_ORDER
  return (
    <section aria-labelledby="mes-metodo" className="card-premium p-4 sm:p-5">
      <h2 id="mes-metodo" className="text-sm font-semibold text-foreground">
        Por dónde entró
      </h2>
      <dl className="mt-3 grid grid-cols-3 gap-x-6 gap-y-3 text-sm sm:flex sm:gap-x-8">
        {methods.map((m) => (
          <div key={m}>
            <dt className="text-xs text-muted-foreground">{formatMethodLabel(m)}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{formatArs(total(m))}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * Un solo vacío, honesto: sin los números de ejemplo que mostraban GhostKpis,
 * las barras fantasma y el "3,2%" de muestra (DESIGN.md, Don't: nada de números
 * que no salgan de datos reales).
 */
export function MonthEmpty({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const name = monthName(month)
  if (!isCurrent) {
    return <EmptyState icon={ChartLine} title={`En ${name} no hubo cobros`} />
  }
  return (
    <EmptyState
      icon={ChartLine}
      title={`Todavía no hay cobros en ${name}`}
      description="Métricas se arma con lo que cobrás en Hoy, la Grilla y Caja. El primer cobro ya aparece acá."
      action={
        <Link href="/grilla" className={buttonVariants({ variant: 'outline' })}>
          Ir a la Grilla
        </Link>
      }
    />
  )
}
