import {
  Ban,
  CheckCheck,
  CheckCircle2,
  Clock,
  HandCoins,
  Plus,
  Repeat,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Leyenda = mini-tutorial del mapeo ícono↔estado (pages/grilla.md §11).
// Mismos tokens que slotVisual en BookingCard — si cambia uno, cambiar el otro.
const GRID_LEGEND: ReadonlyArray<{
  label: string
  icon: LucideIcon
  swatch: string
  iconClass: string
}> = [
  {
    label: 'Libre',
    icon: Plus,
    swatch: 'border border-border/60 bg-card',
    iconClass: 'text-muted-foreground',
  },
  {
    label: 'Esperando seña',
    icon: Clock,
    swatch: 'bg-warning/15 border-l-2 border-l-warning',
    iconClass: 'text-amber-800 dark:text-amber-300',
  },
  {
    label: 'Confirmada',
    icon: HandCoins,
    swatch: 'bg-info/15 border-l-2 border-l-info',
    iconClass: 'text-blue-800 dark:text-blue-300',
  },
  {
    label: 'Señada',
    icon: CheckCircle2,
    swatch: 'bg-success/15 border-l-2 border-l-success',
    iconClass: 'text-emerald-800 dark:text-emerald-300',
  },
  {
    label: 'Jugada',
    icon: CheckCheck,
    swatch: 'bg-success/25 border-l-2 border-l-success',
    iconClass: 'text-emerald-800 dark:text-emerald-300',
  },
  {
    label: 'Ausente',
    icon: UserX,
    swatch: 'bg-destructive/15 border-l-2 border-l-destructive',
    iconClass: 'text-red-700 dark:text-red-300',
  },
  {
    label: 'Abonado',
    icon: Repeat,
    swatch: 'bg-info/15 border-l-2 border-l-info',
    iconClass: 'text-blue-800 dark:text-blue-300',
  },
  {
    label: 'Bloqueado',
    icon: Ban,
    swatch: 'slot-blocked-stripes',
    iconClass: 'text-muted-foreground',
  },
]

/** Leyenda de estados: enseña el mapeo ícono↔estado (pages/grilla.md §11). */
export function GridLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {GRID_LEGEND.map((item) => {
        const LegendIcon = item.icon
        return (
          <li key={item.label} className="flex items-center gap-1.5">
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
