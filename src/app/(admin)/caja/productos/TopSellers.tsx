import Link from 'next/link'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ScrollRegion } from '@/components/ui/scroll-region'
// Tipo puro (DTO) colocado junto a la query en canteen-report.service.ts
// (server-only). `import type` se borra en compilación (isolatedModules): no
// arrastra nada server-only al bundle.
import type { SalesRankingRow } from '@/modules/canteen/canteen-report.service'
import { chipClass } from '../caja-lib'

/** Los que se ven sin abrir nada. El resto queda a un clic. */
const TOP_VISIBLE = 8

type Props = {
  range: 7 | 30
  /** Tal como lo entrega `getSalesRanking`: de más a menos plata. */
  ranking: SalesRankingRow[]
}

/** El rango va en la URL (`?range=30`): el informe se arma en el server. */
function RangeChip({ value, active }: { value: 7 | 30; active: boolean }) {
  return (
    <Link
      href={value === 30 ? '/caja/productos?range=30' : '/caja/productos'}
      aria-current={active ? true : undefined}
      className={cn('inline-flex items-center', chipClass(active))}
    >
      {value} días
    </Link>
  )
}

function SellerRows({ rows, max }: { rows: SalesRankingRow[]; max: number }) {
  return rows.map((row) => (
    <li key={row.productId} className="text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium text-foreground">{row.productName}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          <span aria-hidden="true">{row.units} u</span>
          <span className="sr-only">
            {row.units} {row.units === 1 ? 'unidad' : 'unidades'}
          </span>{' '}
          · <span className="font-semibold text-foreground">{formatArs(row.revenue)}</span>
        </span>
      </div>
      <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${max > 0 ? Math.max((row.revenue / max) * 100, 1) : 0}%` }}
        />
      </div>
    </li>
  ))
}

/**
 * "Lo que más salió": qué vende la cantina, de más a menos plata, con una barra
 * que deja ver la diferencia sin leer números (variante elegida por el dueño el
 * 2026-09-26). Reemplaza al informe de tres tablas: "Cobrado por método"
 * repetía Cuentas y "Por día" no lo miraba nadie.
 *
 * Cuenta lo ENTREGADO (sale del ledger de stock, fiados sin cobrar incluidos),
 * no lo cobrado — por eso no se compara con los totales de Cuentas.
 */
export function TopSellers({ range, ranking }: Props) {
  const revenue = ranking.reduce((sum, r) => sum + r.revenue, 0)
  const units = ranking.reduce((sum, r) => sum + r.units, 0)
  const max = ranking[0]?.revenue ?? 0
  const rest = ranking.slice(TOP_VISIBLE)

  return (
    <section aria-labelledby="lo-que-mas-salio" className="card-premium p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="lo-que-mas-salio" className="text-base font-semibold text-foreground">
          Lo que más salió<span className="sr-only"> en los últimos {range} días</span>
        </h2>
        <div role="group" aria-label="Período" className="flex gap-1.5">
          <RangeChip value={7} active={range === 7} />
          <RangeChip value={30} active={range === 30} />
        </div>
      </header>

      {ranking.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No se vendió nada en los últimos {range} días.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{formatArs(revenue)}</span>{' '}
            en <span className="tabular-nums">{units}</span> {units === 1 ? 'unidad' : 'unidades'}
          </p>
          <ol className="mt-4 space-y-3">
            <SellerRows rows={ranking.slice(0, TOP_VISIBLE)} max={max} />
          </ol>
          {rest.length > 0 && (
            <details className="group mt-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-9">
                <span className="group-open:hidden">
                  {rest.length === 1 ? 'Ver el que sigue' : `Ver los otros ${rest.length}`}
                </span>
                <span className="hidden group-open:inline">Ver menos</span>
              </summary>
              <ScrollRegion label="El resto de lo vendido" className="mt-2 max-h-80 pr-1">
                <ol start={TOP_VISIBLE + 1} className="space-y-3">
                  <SellerRows rows={rest} max={max} />
                </ol>
              </ScrollRegion>
            </details>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Cuenta lo entregado, fiados sin cobrar incluidos.
          </p>
        </>
      )}
    </section>
  )
}
