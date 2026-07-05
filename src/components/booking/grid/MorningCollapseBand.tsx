import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  /** Primer slot plegado (ej. '00:00'). */
  firstSlot: string
  /** Slot donde arranca la actividad visible (ej. '08:00'). */
  boundarySlot: string
  onExpand: () => void
}

/**
 * Banda de madrugada colapsada (pages/grilla.md §5): reemplaza las horas muertas
 * por un botón de 2rem que expande al tocarlo. Es hija directa del CSS Grid
 * (gridRow 2, todas las columnas), por eso vive dentro de GridScroller.
 */
export function MorningCollapseBand({ firstSlot, boundarySlot, onExpand }: Props) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-expanded={false}
      aria-label={`Mostrar horarios sin actividad de ${firstSlot} a ${boundarySlot}`}
      style={{ gridColumn: '1 / -1', gridRow: 2 }}
      className={cn(
        'group flex items-center overflow-hidden border-b border-border bg-muted/30 text-xs text-muted-foreground',
        'transition-colors duration-150 hover:bg-accent/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
    >
      <span className="sticky left-0 flex items-center gap-1.5 px-3">
        <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="tabular-nums">
          {firstSlot}–{boundarySlot}
        </span>
        <span>· Sin actividad ·</span>
        <span className="font-medium text-foreground group-hover:underline">Mostrar</span>
      </span>
    </button>
  )
}
