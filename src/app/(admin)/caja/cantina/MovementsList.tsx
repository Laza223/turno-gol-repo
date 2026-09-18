import type { ReactNode } from 'react'
import { Receipt } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { SectionHeader } from '@/components/admin/SectionHeader'
import type { CashFlowListRow } from '@/modules/cashflow/cashflow.types'
import { SignedAmount } from './SignedAmount'
import { CategoryBadge } from './CategoryBadge'
import { formatTimeArt, movementTitle, METHOD_LABELS } from '../caja-lib'

/**
 * El diario de plata, en dos usos:
 *
 * - **Cuentas** lo muestra entero y paginado, con el total del día y el alta de
 *   movimiento colgando de su encabezado.
 * - **Vender** muestra las últimas cinco, sin totales y sin alta: es el acuse de
 *   recibo de lo que se acaba de cobrar ("¿entró?", "¿lo cargué dos veces?"),
 *   no un informe.
 *
 * Un solo componente y no dos: la fila de un movimiento es la misma pregunta en
 * las dos pantallas, y duplicarla garantiza que dentro de un mes digan cosas
 * distintas. Lo que cambia se pasa por props.
 *
 * La tabla de escritorio es un `<table>` de verdad (el e2e ancla las aserciones
 * de plata con `getByRole('row')`); en el teléfono, la misma fila como lista.
 */
export function MovementsList({
  cashFlows,
  heading = 'Movimientos del día',
  meta,
  actions,
  footer,
  emptyAction,
  emptyTitle = 'Sin movimientos por ahora',
  emptyDescription = "Los cobros de reservas se registran solos. Las ventas de cantina se cargan más arriba; los gastos, desde 'Registrar movimiento'.",
}: {
  cashFlows: CashFlowListRow[]
  heading?: string
  meta?: ReactNode
  actions?: ReactNode
  /** Pie de la lista: el link "Ver todos" de Vender, el paginador de Cuentas. */
  footer?: ReactNode
  emptyAction?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
}) {
  const header = <SectionHeader title={heading} meta={meta} actions={actions} className="pb-2" />

  const list = (
    <ul className="divide-y divide-border border-b border-border">
      {cashFlows.map((cf) => (
        <MovementItem key={cf.id} cf={cf} />
      ))}
    </ul>
  )

  if (cashFlows.length === 0) {
    return (
      <section className="space-y-3">
        {header}
        <EmptyState
          icon={Receipt}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          className="border-0 py-8"
        />
      </section>
    )
  }

  return (
    <section className="space-y-3">
      {header}
      <ResponsiveList
        flat
        cards={list}
        // Tres columnas y no cinco: categoría y método bajan a una segunda
        // línea de la descripción. Así la tabla entra en la columna angosta de
        // Cuentas (al lado de las deudas) sin scroll horizontal, y en Vender no
        // estira cinco celdas de punta a punta para decir lo mismo.
        table={
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="w-14 py-2 pr-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Hora
                </th>
                <th className="py-2 pr-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Movimiento
                </th>
                <th className="py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cashFlows.map((cf) => (
                <tr key={cf.id} className="transition-colors hover:bg-accent/50">
                  <td className="py-2 pr-3 align-top tabular-nums text-muted-foreground">
                    {formatTimeArt(cf.occurredAt)}
                  </td>
                  <td className="max-w-0 py-2 pr-3">
                    <p className="truncate text-foreground">
                      {movementTitle(cf.description)}
                      {cf.counterpartName != null && (
                        <span className="text-muted-foreground"> · {cf.counterpartName}</span>
                      )}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <CategoryBadge type={cf.type} category={cf.category} />
                      {METHOD_LABELS[cf.method] ?? cf.method}
                    </p>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right align-top">
                    <SignedAmount type={cf.type} amount={cf.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
      {footer}
    </section>
  )
}

/**
 * Un movimiento en dos renglones: arriba hora, qué fue y el monto (lo que se
 * lee de un vistazo); abajo categoría y método (lo que se lee si hace falta).
 */
function MovementItem({ cf }: { cf: CashFlowListRow }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-foreground">
          <span className="mr-2 tabular-nums text-muted-foreground">
            {formatTimeArt(cf.occurredAt)}
          </span>
          {movementTitle(cf.description)}
          {cf.counterpartName != null && (
            <span className="text-muted-foreground"> · {cf.counterpartName}</span>
          )}
        </p>
        <span className="shrink-0 text-sm">
          <SignedAmount type={cf.type} amount={cf.amount} />
        </span>
      </div>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
        <CategoryBadge type={cf.type} category={cf.category} />
        {METHOD_LABELS[cf.method] ?? cf.method}
      </p>
    </li>
  )
}
