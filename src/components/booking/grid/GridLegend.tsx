import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GRID_MONEY_LEGEND_ITEMS, type GridMoneyLegendItem } from '@/lib/booking/slot-visual'

// Leyenda = mini-tutorial del mapeo color↔estado (variante "Entra entera",
// decisión del dueño 2026-09-25: el color es de la plata). Se DERIVA de la
// misma tabla que pinta las celdas (`gridMoneyVisual`), así que ya no puede
// desincronizarse de ellas.
const FREE: GridMoneyLegendItem = {
  key: 'free',
  label: 'Libre',
  icon: Plus,
  swatch: 'border border-border/60 bg-card',
  iconClass: 'text-muted-foreground',
}

const LEGEND: readonly GridMoneyLegendItem[] = [FREE, ...GRID_MONEY_LEGEND_ITEMS]

/** Leyenda de estados: enseña el mapeo ícono↔estado (pages/grilla.md §11). */
export function GridLegend() {
  return (
    <>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground shrink-0">
        {LEGEND.map((item) => {
          const LegendIcon = item.icon
          return (
            <li key={item.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn('flex h-4 w-4 items-center justify-center rounded-sm', item.swatch)}
              >
                {LegendIcon && <LegendIcon className={cn('h-2.5 w-2.5', item.iconClass)} />}
              </span>
              {item.label}
            </li>
          )
        })}
      </ul>
      {/* El monto en la celda no es un color, así que la leyenda (que responde
          "¿qué significa cada color?") no lo explica por sí sola. Sin esta
          línea el dueño ve un $ sin saber si es el precio o el saldo. */}
      <p className="mt-2 text-xs text-muted-foreground">
        El monto en la celda es lo que falta cobrar de ese turno.
      </p>
    </>
  )
}
