'use client'

import { useState, type ReactNode } from 'react'
import {
  CalendarClock,
  CircleDollarSign,
  CupSoda,
  NotebookPen,
  Receipt,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import { cn } from '@/lib/utils'
import { chipClass } from '../caja-lib'
import { groupByHour, type LedgerKind, type LedgerRow } from './ledger'

const KIND: Record<LedgerKind, { icon: LucideIcon; label: string }> = {
  turno: { icon: CalendarClock, label: 'Turno' },
  cantina: { icon: CupSoda, label: 'Cantina' },
  fiado: { icon: NotebookPen, label: 'Fiado cobrado' },
  torneo: { icon: Trophy, label: 'Torneo' },
  gasto: { icon: Receipt, label: 'Gasto' },
  otro: { icon: CircleDollarSign, label: 'Otro' },
}

type Filter = 'all' | 'turno' | 'cantina' | 'gasto'

/** Cantina incluye los fiados que se cobraron: es plata de la cantina que entró. */
function matches(row: LedgerRow, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'cantina') return row.kind === 'cantina' || row.kind === 'fiado'
  return row.kind === filter
}

function KindIcon({ kind, className }: { kind: LedgerKind; className?: string }) {
  const { icon: Icon, label } = KIND[kind]
  return (
    <Icon
      role="img"
      aria-label={label}
      className={cn('h-4 w-4 shrink-0 text-muted-foreground', className)}
    />
  )
}

/**
 * El monto de un movimiento. Todo lo del libro es plata que entró, así que va
 * en el color del texto con su "+"; 40 montos verdes seguidos no dicen nada
 * (decisión del dueño, 2026-09-25). El rojo queda para lo que salió.
 */
function Amount({ row }: { row: LedgerRow }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap font-medium tabular-nums',
        row.expense ? 'text-red-700 dark:text-red-400' : 'text-foreground',
      )}
    >
      {row.expense ? '−' : '+'}
      {formatArs(row.cents)}
    </span>
  )
}

function RowText({ row }: { row: LedgerRow }) {
  return (
    <span className="truncate text-foreground">
      {row.text}
      {row.detail && <span className="text-muted-foreground"> · {row.detail}</span>}
    </span>
  )
}

/**
 * El libro de la noche: todo lo que entró y salió en el día operativo, del más
 * nuevo al más viejo y agrupado por hora, para que la noche se lea como se vivió
 * (el pico de las 20 y las 21). Es lo primero que se busca en Caja: estaba
 * detrás de la tabla de lo sin cobrar y en el teléfono quedaba al final de todo.
 *
 * Una fila por movimiento, sin chip de color: el ícono dice de qué es y el
 * texto, quién pagó o qué se vendió. La tabla va desde `lg`; debajo, la misma
 * fila en dos renglones.
 */
export function NightLedger({
  rows,
  total,
  actions,
  footer,
  emptyTitle,
  emptyDescription,
}: {
  rows: LedgerRow[]
  /** Todos los movimientos del día, aunque esta página traiga menos. */
  total: number
  /** "Registrar movimiento", solo en el día de hoy. */
  actions?: ReactNode
  /** El paginador, si el día no entra en una página. */
  footer?: ReactNode
  emptyTitle: string
  emptyDescription: string
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = rows.filter((r) => matches(r, filter))
  const groups = groupByHour(visible)

  const count = (f: Filter) => rows.filter((r) => matches(r, f)).length
  const filters: Array<[Filter, string, number]> = [
    ['all', 'Todo', rows.length],
    ['turno', 'Turnos', count('turno')],
    ['cantina', 'Cantina', count('cantina')],
    // Casi nunca hay gastos (en el Vagón, 0 en diez noches): el filtro aparece
    // solo cuando hay alguno.
    ...(count('gasto') > 0
      ? [['gasto', 'Gastos', count('gasto')] as [Filter, string, number]]
      : []),
  ]

  return (
    <section aria-labelledby="movimientos-titulo" className="card-premium overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="movimientos-titulo" className="text-base font-semibold text-foreground">
          Movimientos{' '}
          <span className="font-normal tabular-nums text-muted-foreground">{total}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {rows.length > 0 && (
            <div role="group" aria-label="Filtrar movimientos" className="flex gap-1.5">
              {filters.map(([value, label, n]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={chipClass(filter === value)}
                >
                  {label} <span className="tabular-nums">{n}</span>
                </button>
              ))}
            </div>
          )}
          {actions}
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={emptyTitle}
          description={emptyDescription}
          className="border-0 py-10"
        />
      ) : (
        <>
          <table className="hidden w-full text-sm lg:table">
            <thead className="sr-only">
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">Movimiento</th>
                <th scope="col">Método</th>
                <th scope="col">Monto</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={`${g.hour}-${g.rows[0]?.id}`} className="border-b border-border">
                <tr className="bg-muted/40">
                  <th
                    scope="rowgroup"
                    colSpan={3}
                    className="px-5 py-1.5 text-left text-xs font-medium text-muted-foreground"
                  >
                    {g.hour} h · {g.rows.length}{' '}
                    {g.rows.length === 1 ? 'movimiento' : 'movimientos'}
                  </th>
                  <td className="px-5 py-1.5 text-right text-xs font-medium tabular-nums text-muted-foreground">
                    {formatArs(g.netCents)}
                  </td>
                </tr>
                {g.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border transition-colors hover:bg-accent/50"
                  >
                    <td className="w-16 py-2 pl-5 tabular-nums text-muted-foreground">
                      {row.time}
                    </td>
                    <td className="max-w-0 py-2 pr-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <KindIcon kind={row.kind} />
                        <RowText row={row} />
                      </span>
                    </td>
                    <td className="w-36 py-2 text-muted-foreground">{METHOD_LABELS[row.method]}</td>
                    <td className="w-32 py-2 pr-5 text-right">
                      <Amount row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>

          <ul className="divide-y divide-border lg:hidden">
            {visible.map((row) => (
              <li key={row.id} className="flex items-start gap-3 px-4 py-2.5">
                <KindIcon kind={row.kind} className="mt-0.5" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex min-w-0">
                    <RowText row={row} />
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {row.time} · {METHOD_LABELS[row.method]}
                  </p>
                </div>
                <span className="text-sm">
                  <Amount row={row} />
                </span>
              </li>
            ))}
          </ul>

          {visible.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nada de esto en el día.
            </p>
          )}
        </>
      )}

      {footer && <div className="border-t border-border px-4 py-3 sm:px-5">{footer}</div>}
    </section>
  )
}
