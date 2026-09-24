import Link from 'next/link'
import { formatArs } from '@/lib/format'
import { Th, Td, Tr } from '@/components/ui/table'
// Tipos puros (DTOs) colocados junto a las queries en canteen-report.service.ts
// (server-only, NO se toca ese archivo). `import type` se borra en compilación
// (isolatedModules): no arrastra nada server-only al bundle del cliente.
import type {
  CanteenDailyTotal,
  CanteenMethodTotal,
  SalesRankingRow,
} from '@/modules/canteen/canteen-report.service'
import { chipClass, mediumDateLabel, METHOD_LABELS } from '../caja-lib'

type Props = {
  range: 7 | 30
  ranking: SalesRankingRow[]
  byMethod: CanteenMethodTotal[]
  daily: CanteenDailyTotal[]
}

const REPORT_HEADING_ID = 'canteen-report-heading'

/** Link con el mismo look de `chipClass` (chip seleccionable) para el toggle de rango. */
function RangeChip({ value, active }: { value: 7 | 30; active: boolean }) {
  return (
    <Link
      href={`/caja/productos?range=${value}`}
      aria-current={active ? true : undefined}
      className={`inline-flex items-center ${chipClass(active)}`}
    >
      {value} días
    </Link>
  )
}

/**
 * Reporte de ventas de cantina (tab Productos, Fase 7). Presentacional puro:
 * sin fetch, todo llega por props — el ranking sale del ledger (incluye
 * fiados aún no cobrados, agrupa por día de ENTREGA) y método/día salen de
 * cash_flows (solo lo COBRADO); la asimetría es deliberada — ver
 * canteen-report.service.ts y la nota al pie de esta misma card.
 */
export function CanteenReport({ range, ranking, byMethod, daily }: Props) {
  return (
    <section aria-labelledby={REPORT_HEADING_ID} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id={REPORT_HEADING_ID} className="text-base font-semibold text-foreground">
          Ventas de cantina — últimos {range} días
        </h2>
        <div className="flex items-center gap-2" role="group" aria-label="Rango del reporte">
          <RangeChip value={7} active={range === 7} />
          <RangeChip value={30} active={range === 30} />
        </div>
      </div>

      {/* Ranking: Producto / Unidades / Plata, orden tal como viene (revenue DESC). */}
      <div className="mb-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ranking de productos
        </h3>
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Producto</Th>
                  <Th align="right">Unidades</Th>
                  <Th align="right" className="pr-0">
                    Plata
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ranking.map((row) => (
                  <Tr key={row.productId}>
                    <Td className="text-foreground">{row.productName}</Td>
                    <Td numeric>{row.units}</Td>
                    <Td numeric className="pr-0 font-medium">
                      {formatArs(row.revenue)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cobrado por método: solo lo que entró a la caja (fiados abiertos no cuentan). */}
      <div className="mb-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Cobrado por método
        </h3>
        {byMethod.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cobros en el período.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {byMethod.map((m) => (
              <span
                key={m.method}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground"
              >
                {METHOD_LABELS[m.method]}
                <span className="tabular-nums">{formatArs(m.total)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Por día: scroll vertical si hay más de 10 filas (rango 30). */}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Por día
        </h3>
        {daily.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cobros en el período.</p>
        ) : (
          <div
            className="max-h-64 overflow-y-auto overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Cobrado por día, con scroll"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Fecha</Th>
                  <Th align="right" className="pr-0">
                    Cobrado
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {daily.map((d) => (
                  <Tr key={d.day}>
                    <Td className="text-foreground">{mediumDateLabel(d.day)}</Td>
                    <Td numeric className="pr-0 font-medium">
                      {formatArs(d.total)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        El ranking cuenta lo entregado (incluye fiados sin cobrar). Los montos cobrados entran
        cuando se pagan.
      </p>
    </section>
  )
}
