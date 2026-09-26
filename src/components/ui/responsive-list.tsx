import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ScrollRegion } from './scroll-region'

type Props = {
  /** Encabezado opcional (título/acciones) renderizado dentro del borde, arriba de cards y tabla. */
  header?: ReactNode
  /** Vista mobile (<640px): lista de cards apiladas (típicamente un <ul>). */
  cards: ReactNode
  /** Vista desktop (sm+): tabla densa; pasarle min-w-[…] para que scrollee el wrapper. */
  table: ReactNode
  /**
   * Sin card: ni borde exterior, ni fondo propio, ni sombra. Para las listas
   * que apoyan directo sobre el fondo de la página y se separan del resto por
   * su encabezado, no por una caja alrededor
   * (`docs/planning/2026-09-17-plan-diseno-sacar-lo-generico.md` §2: "superficies
   * sin sombra, separadas por borde de 1 px o por espacio").
   */
  flat?: boolean
  /**
   * Nombre de la lista cuando puede ser larga: con él, las dos vistas tienen
   * tope de alto y scroll propio (`ScrollRegion`) en vez de estirar la página.
   */
  scrollLabel?: string
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
export function ResponsiveList({ header, cards, table, flat, scrollLabel, className }: Props) {
  return (
    <div
      className={cn(
        'overflow-hidden',
        flat ? 'min-w-0' : 'rounded-xl border border-border/60 bg-card shadow-xs',
        className,
      )}
    >
      {header}
      {scrollLabel ? (
        <>
          <ScrollRegion label={scrollLabel} className="hidden overflow-x-auto sm:block">
            {table}
          </ScrollRegion>
          <ScrollRegion label={scrollLabel} className="sm:hidden">
            {cards}
          </ScrollRegion>
        </>
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">{table}</div>
          <div className="sm:hidden">{cards}</div>
        </>
      )}
    </div>
  )
}
