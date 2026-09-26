import type { ReactNode, Ref } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  /** Nombre accesible de la región ("Productos del catálogo", "Personas"…). */
  label: string
  className?: string
  children: ReactNode
  ref?: Ref<HTMLDivElement>
}

/**
 * Lista larga con scroll propio: un tope de alto y la lista se recorre adentro,
 * en vez de estirar la página hasta que lo que viene abajo queda a metros
 * (pedido del dueño, 2026-09-26: "un scroll general muy largo es muy malo").
 * El tope deja ver el resto de la página también en el teléfono.
 *
 * Es enfocable para que se pueda scrollear con el teclado aunque la lista no
 * tenga nada clickeable (axe: `scrollable-region-focusable`), y el encabezado
 * visible de una tabla adentro queda pegado arriba.
 */
export function ScrollRegion({ label, className, children, ref }: Props) {
  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        'max-h-[min(36rem,65dvh)] overflow-y-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        // Un `thead` `sr-only` (el libro de Cuentas) no se pega: `sticky` le
        // pisaría el `position: absolute` y dejaría una franja vacía arriba.
        '[&_thead:not(.sr-only)]:sticky [&_thead:not(.sr-only)]:top-0 [&_thead:not(.sr-only)]:z-10 [&_thead:not(.sr-only)]:bg-card',
        className,
      )}
    >
      {children}
    </div>
  )
}
