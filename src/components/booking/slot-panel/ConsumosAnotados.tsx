'use client'

import { X } from 'lucide-react'
import { formatArs } from '@/lib/format'
import type { BookingConsumo } from '@/modules/canteen/canteen.types'
import { cn } from '@/lib/utils'

/** Lo que el cobro de "Todo junto" necesita de los consumos anotados al turno. */
export type ConsumosView = {
  items: BookingConsumo[]
  /** "Cobrar con el turno": tildado, el botón suma lo anotado y los cobra juntos. */
  include: boolean
  onIncludeChange: (include: boolean) => void
  /** Quitar una tanda anotada por error (devuelve el stock). */
  onRemove: (tabId: string) => void
  /** Todavía no llegó la primera lectura: no se sabe si hay anotados, así que no se cobra. */
  loading: boolean
  /** La lectura falló: se avisa, porque "no hay anotados" y "no pudimos ver" no son lo mismo. */
  failed: boolean
  onRetry: () => void
}

/** "2 × Cerveza, Agua": lo que se anotó en una tanda, en una línea. */
function itemsLabel(items: BookingConsumo['items']): string {
  return items.map((i) => (i.qty === 1 ? i.name : `${i.qty} × ${i.name}`)).join(', ')
}

/**
 * Los consumos que pidieron durante el turno y quedaron anotados (docs/decisions/
 * 2026-11-17-consumos-anotados-al-turno.md): el modal de cobro los avisa y, tildado,
 * los cobra junto con la cancha — el "todo junto" que antes se anotaba en papel.
 *
 * No existe sin anotados: el 99% de los cobros no los tiene y el modal queda igual
 * que siempre. Quieto, sin color de alarma: no es una deuda, es parte de la cuenta.
 */
export function ConsumosAnotados({
  consumos,
  disabled,
  canInclude,
}: {
  consumos: ConsumosView
  disabled: boolean
  /** Falso con el pago dividido en varios medios: ahí los consumos no se pueden sumar. */
  canInclude: boolean
}) {
  const total = consumos.items.reduce((sum, c) => sum + c.totalAmount, 0)
  const checkboxDisabled = disabled || !canInclude

  return (
    <div
      role="group"
      aria-label="Consumos anotados"
      className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Consumos anotados</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{formatArs(total)}</p>
      </div>

      <ul className="flex flex-col">
        {consumos.items.map((c) => (
          <li key={c.tabId} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">{itemsLabel(c.items)}</span>
            <button
              type="button"
              onClick={() => consumos.onRemove(c.tabId)}
              disabled={disabled}
              aria-label={`Quitar del turno: ${itemsLabel(c.items)}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 md:h-9 md:w-9"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <label
        className={cn(
          'flex min-h-11 items-center gap-2.5 text-sm font-medium text-foreground md:min-h-9',
          checkboxDisabled && 'opacity-60',
        )}
      >
        <input
          type="checkbox"
          checked={consumos.include && canInclude}
          onChange={(e) => consumos.onIncludeChange(e.target.checked)}
          disabled={checkboxDisabled}
          className="h-4 w-4 shrink-0 accent-primary"
        />
        Cobrar con el turno
      </label>
      {!canInclude && (
        <p className="text-xs text-muted-foreground">
          Para sumarlos al cobro, dejá un solo medio de pago.
        </p>
      )}
    </div>
  )
}
