import { Receipt } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ResponsiveList } from '@/components/ui/responsive-list'
import type { CashFlowRow } from '@/modules/cashflow/cashflow.types'
import { EmptyMovementAction } from './EmptyMovementAction'
import { SignedAmount } from './SignedAmount'
import { CategoryBadge } from './CategoryBadge'
import { formatTimeArt, METHOD_LABELS } from '../caja-lib'
import type { CreateCashFlowAction } from './RegisterMovementModal'

export function MovementsList({
  cashFlows,
  isClosed,
  date,
  cutoffMins,
  createCashFlowAction,
}: {
  cashFlows: CashFlowRow[]
  isClosed: boolean
  date: string
  cutoffMins: number
  createCashFlowAction: CreateCashFlowAction
}) {
  if (cashFlows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card shadow-xs">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium text-foreground">Movimientos del día</h2>
        </div>
        {isClosed ? (
          <EmptyState icon={Receipt} title="Este día no tuvo movimientos." />
        ) : (
          <EmptyState
            icon={Receipt}
            title="Sin movimientos por ahora"
            description="Los cobros de reservas se registran solos. Las ventas de cantina y los gastos se cargan desde los botones de arriba."
            action={
              <EmptyMovementAction
                date={date}
                cutoffMins={cutoffMins}
                createCashFlowAction={createCashFlowAction}
              />
            }
          />
        )}
      </div>
    )
  }

  return (
    <ResponsiveList
      className="shadow-xs"
      header={
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium text-foreground">Movimientos del día</h2>
        </div>
      }
      cards={
        <ul className="divide-y divide-border">
          {cashFlows.map((cf) => (
            <li key={cf.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <CategoryBadge type={cf.type} category={cf.category} />
                <p className="mt-1 truncate text-sm text-foreground">{cf.description}</p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {formatTimeArt(cf.occurredAt)} · {METHOD_LABELS[cf.method] ?? cf.method}
                </p>
              </div>
              <p className="shrink-0 text-sm">
                <SignedAmount type={cf.type} amount={cf.amount} />
              </p>
            </li>
          ))}
        </ul>
      }
      table={
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Hora
              </th>
              <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Descripción
              </th>
              <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Categoría
              </th>
              <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Método
              </th>
              <th className="p-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Monto
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cashFlows.map((cf) => (
              <tr key={cf.id} className="transition-colors hover:bg-accent/50">
                <td className="p-2.5 pl-4 tabular-nums text-muted-foreground">
                  {formatTimeArt(cf.occurredAt)}
                </td>
                <td className="max-w-xs truncate p-2.5 text-foreground">{cf.description}</td>
                <td className="p-2.5">
                  <CategoryBadge type={cf.type} category={cf.category} />
                </td>
                <td className="p-2.5 text-foreground">
                  {METHOD_LABELS[cf.method] ?? cf.method}
                </td>
                <td className="p-2.5 pr-4 text-right">
                  <SignedAmount type={cf.type} amount={cf.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
