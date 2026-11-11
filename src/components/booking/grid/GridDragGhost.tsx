import { cn } from '@/lib/utils'
import type { DragState } from '@/hooks/use-grid-drag'

/**
 * El cartelito que sigue al puntero mientras se arrastra un turno: a quién
 * es y, si está sobre un hueco, a dónde va. `pointer-events-none` es lo que
 * deja a `elementFromPoint` ver la celda de abajo en vez de a este cartel.
 */
export function GridDragGhost({
  drag,
  targetLabel,
}: {
  drag: DragState
  /** A dónde cae, ya armado por la vista (cancha y hora, o día y hora). */
  targetLabel: string | null
}) {
  const { booking, target } = drag
  const who =
    booking.guestName ??
    (booking.playerFirstName
      ? `${booking.playerFirstName} ${booking.playerLastName ?? ''}`.trim()
      : 'Turno')
  return (
    <div
      aria-hidden
      data-testid="drag-ghost"
      style={{ left: drag.x + 14, top: drag.y + 14 }}
      className={cn(
        'pointer-events-none fixed z-50 max-w-56 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-lg',
        target?.valid ? 'border-primary' : 'border-border',
      )}
    >
      <p className="truncate font-semibold text-foreground">{who}</p>
      <p
        className={cn(
          'truncate tabular-nums',
          target && !target.valid ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground',
        )}
      >
        {target ? (target.valid ? targetLabel : 'Ahí no se puede') : 'Soltalo en un hueco libre'}
      </p>
    </div>
  )
}
