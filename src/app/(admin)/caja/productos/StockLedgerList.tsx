import type { ReactNode } from 'react'
import { History } from 'lucide-react'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { EmptyState } from '@/components/ui/empty-state'
import { Th, Td, Tr } from '@/components/ui/table'
import type { StockLedgerEntry, StockMovementKind } from '@/modules/canteen/canteen.types'

const KIND_LABELS: Record<StockMovementKind, string> = {
  purchase: 'Compra',
  sale: 'Venta',
  waste: 'Merma',
  courtesy: 'Cortesía',
  internal_use: 'Consumo',
  adjustment: 'Ajuste',
}

/** "Venta" con tab_id (sin cash_flow) es un fiado, no una venta cobrada. */
function kindLabel(entry: StockLedgerEntry): string {
  if (entry.kind === 'sale' && entry.tabId) return 'Fiado'
  return KIND_LABELS[entry.kind]
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function QtyChip({ qty }: { qty: number }) {
  return (
    <span
      className={`shrink-0 text-sm font-medium tabular-nums ${
        qty < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-400'
      }`}
    >
      {qty > 0 ? `+${qty}` : qty}
    </span>
  )
}

/**
 * Resumen del movimiento más reciente, para el encabezado del bloque plegado:
 * "Gatorade −2 · Venta · 12/09 23:10".
 *
 * Un disclosure cuyo encabezado no dice qué hay adentro obliga a abrirlo para
 * averiguar si valía la pena abrirlo. Con esto se sabe de un vistazo si pasó
 * algo desde la última vez. Devuelve null sin movimientos: no hay nada que
 * resumir y el encabezado no debe inventar una frase.
 */
export function lastMovementSummary(entries: StockLedgerEntry[]): string | null {
  const last = entries[0]
  if (!last) return null
  const qty = last.qty > 0 ? `+${last.qty}` : `${last.qty}`
  return `Último: ${last.productName} ${qty} · ${kindLabel(last)} · ${shortDate(last.occurredAt)}`
}

/**
 * Movimientos de stock (compras, ventas, mermas, ajustes) — tab Productos.
 *
 * Vive adentro del `Disclosure` "Movimientos de stock", que ya es su título:
 * por eso no abre card ni encabezado propio (antes decía "Movimientos de stock"
 * dos veces, una arriba de la otra). `footer` recibe el paginador.
 */
export function StockLedgerList({
  entries,
  footer,
}: {
  entries: StockLedgerEntry[]
  footer?: ReactNode
}) {
  if (entries.length === 0) {
    return (
      <>
        <EmptyState
          icon={History}
          title="Todavía no hay movimientos de stock."
          className="border-0 py-8"
        />
        {footer}
      </>
    )
  }

  return (
    <div className="space-y-3">
      <ResponsiveList
        flat
        cards={
          <ul className="divide-y divide-border border-b border-border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{e.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {kindLabel(e)} · {shortDate(e.occurredAt)}
                  </p>
                </div>
                <QtyChip qty={e.qty} />
              </li>
            ))}
          </ul>
        }
        table={
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <Th>Fecha</Th>
                <Th>Producto</Th>
                <Th>Tipo</Th>
                <Th align="right">Cantidad</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <Tr key={e.id}>
                  <Td className="tabular-nums text-muted-foreground">{shortDate(e.occurredAt)}</Td>
                  <Td className="text-foreground">{e.productName}</Td>
                  <Td className="text-foreground">{kindLabel(e)}</Td>
                  <Td align="right">
                    <QtyChip qty={e.qty} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </table>
        }
      />
      {footer}
    </div>
  )
}
