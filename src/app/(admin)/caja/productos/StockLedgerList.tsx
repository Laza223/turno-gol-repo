import { History } from 'lucide-react'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { EmptyState } from '@/components/ui/empty-state'
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
        qty < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
      }`}
    >
      {qty > 0 ? `+${qty}` : qty}
    </span>
  )
}

/** Últimos movimientos de stock (compras, ventas, mermas, ajustes) — tab Productos. */
export function StockLedgerList({ entries }: { entries: StockLedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card shadow-xs">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium text-foreground">Movimientos de stock</h2>
        </div>
        <EmptyState icon={History} title="Todavía no hay movimientos de stock." />
      </div>
    )
  }

  return (
    <ResponsiveList
      className="shadow-xs"
      header={
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium text-foreground">Movimientos de stock</h2>
        </div>
      }
      cards={
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
              <th className="p-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fecha
              </th>
              <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Producto
              </th>
              <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tipo
              </th>
              <th className="p-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cantidad
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((e) => (
              <tr key={e.id} className="transition-colors hover:bg-accent/50">
                <td className="p-2.5 pl-4 tabular-nums text-muted-foreground">
                  {shortDate(e.occurredAt)}
                </td>
                <td className="p-2.5 text-foreground">{e.productName}</td>
                <td className="p-2.5 text-foreground">{kindLabel(e)}</td>
                <td className="p-2.5 pr-4 text-right">
                  <QtyChip qty={e.qty} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
