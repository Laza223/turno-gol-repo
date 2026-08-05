import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GRID_LEGEND_ITEMS, type LegendItem } from '@/lib/booking/slot-visual'

// Leyenda = mini-tutorial del mapeo ícono↔estado (pages/grilla.md §11).
// Desde Fase 3 se DERIVA de la misma tabla que pinta las celdas
// (@/lib/booking/slot-visual), así que ya no puede desincronizarse de ellas —
// era el caso hasta acá: los tintes de la leyenda usaban /15 y /25 donde las
// celdas usaban /10 y /20, y el comentario que decía "si cambia uno, cambiar el
// otro" no alcanzó para evitarlo.
const FREE: LegendItem = {
  key: 'free',
  label: 'Libre',
  icon: Plus,
  swatch: 'border border-border/60 bg-card',
  iconClass: 'text-muted-foreground',
}

const LEGEND: readonly LegendItem[] = [FREE, ...GRID_LEGEND_ITEMS]

/** Leyenda de estados: enseña el mapeo ícono↔estado (pages/grilla.md §11). */
export function GridLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground shrink-0">
      {LEGEND.map((item) => {
        const LegendIcon = item.icon
        return (
          <li key={item.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn('flex h-4 w-4 items-center justify-center rounded-sm', item.swatch)}
            >
              <LegendIcon className={cn('h-2.5 w-2.5', item.iconClass)} />
            </span>
            {item.label}
          </li>
        )
      })}
    </ul>
  )
}
