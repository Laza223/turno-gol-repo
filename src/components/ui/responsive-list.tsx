import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  /** Vista mobile (<640px): lista de cards apiladas (típicamente un <ul>). */
  cards: ReactNode
  /** Vista desktop (sm+): tabla densa; pasarle min-w-[…] para que scrollee el wrapper. */
  table: ReactNode
  className?: string
}

/**
 * Patrón caja (pages/caja.md §6.6, MASTER §12 "sin scroll horizontal a 375px"):
 * datos anchos como cards en mobile y tabla con scroll propio (overflow-x-auto)
 * en desktop — la página nunca scrollea horizontal.
 * La tabla va PRIMERO en el DOM: los e2e de escritorio usan .first() sobre
 * acciones repetidas en ambas vistas y deben agarrar la visible (la tabla).
 * El orden visual no cambia: solo una vista se muestra por breakpoint.
 */
export function ResponsiveList({ cards, table, className }: Props) {
  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="hidden overflow-x-auto sm:block">{table}</div>
      <div className="sm:hidden">{cards}</div>
    </div>
  )
}
