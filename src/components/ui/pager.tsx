import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Paginador del panel.
 *
 * Con el total conocido (`total` + `pageSize`) dice qué tramo se ve y sobre
 * cuántos ("Mostrando 26–50 de 312") y numera las páginas, con la primera y la
 * última siempre a mano: la fila más vieja de un historial está a un clic, no a
 * trece. En el teléfono los números se cambian por "3 de 13" y las flechas
 * quedan de 44 px.
 *
 * Sin el total (`hasMore`, la fila sobrante de un `LIMIT n+1`) solo puede decir
 * "Página N" y ofrecer anterior/siguiente.
 *
 * Dos formas de moverse, según dónde viven las filas:
 *
 * - `hrefFor`: la página va en la URL y la trae el servidor. Es un link de
 *   verdad: se abre en otra pestaña y "atrás" vuelve a la página anterior.
 * - `onPageChange`: las filas ya están todas en el cliente y la página es solo
 *   cuánto se dibuja (las deudas de Cuentas, que se filtran por nombre y origen
 *   sobre la lista entera — paginar en el servidor filtraría solo la página).
 *
 * "Anteriores" / "Siguientes" se quedan en su lugar aunque no haya adónde ir
 * (apagados, no borrados): si desaparecen, el resto de la barra salta y el
 * clic siguiente cae en otro lado. No se dibuja nada si hay una sola página.
 */
export function Pager(props: PagerProps) {
  const { label, page, className } = props
  const known = props.total !== undefined
  const pageCount = known ? Math.max(Math.ceil(props.total / props.pageSize), 1) : null
  // Fuera de rango (`?pagina=99` de un link viejo) no se dibuja: "Anteriores"
  // llevaría a la 98, otra página vacía. La pantalla dice que esa página no
  // existe y ofrece volver a la primera.
  if (pageCount !== null && page > pageCount - 1) return null
  const hasPrev = page > 0
  const hasNext = pageCount !== null ? page < pageCount - 1 : props.hasMore
  if (!hasPrev && !hasNext) return null

  const go = (target: number, content: ReactNode, extra: ControlExtra = {}) =>
    props.hrefFor ? (
      <Link
        href={props.hrefFor(target)}
        rel={extra.rel}
        aria-label={extra.ariaLabel}
        className={extra.className}
      >
        {content}
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => props.onPageChange(target)}
        aria-label={extra.ariaLabel}
        className={extra.className}
      >
        {content}
      </button>
    )

  const step = (dir: 'prev' | 'next') => {
    const enabled = dir === 'prev' ? hasPrev : hasNext
    const text = dir === 'prev' ? 'Anteriores' : 'Siguientes'
    const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
    const content = (
      <>
        {dir === 'prev' && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
        {/* En el teléfono queda la flecha sola; el texto sigue siendo el nombre. */}
        <span className="sr-only sm:not-sr-only">{text}</span>
        {dir === 'next' && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      </>
    )
    if (!enabled) {
      return (
        <span aria-disabled="true" className={cn(STEP, 'cursor-not-allowed text-muted-foreground')}>
          {content}
        </span>
      )
    }
    return go(dir === 'prev' ? page - 1 : page + 1, content, {
      rel: dir,
      className: cn(STEP, 'text-foreground hover:bg-accent'),
    })
  }

  return (
    <nav
      aria-label={label}
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3',
        className,
      )}
    >
      {known ? (
        <p className="text-sm text-muted-foreground" aria-live="polite" role="status">
          <span className="hidden sm:inline">Mostrando </span>
          <span className="font-medium tabular-nums text-foreground">
            {rangeLabel(page, props.pageSize, props.total, props.shown)}
          </span>{' '}
          de <span className="font-medium tabular-nums text-foreground">{props.total}</span>
        </p>
      ) : (
        <p className="text-sm tabular-nums text-muted-foreground">Página {page + 1}</p>
      )}

      {/* `ml-auto`: en una columna angosta (el diario de Cuentas) los controles
          bajan de renglón y se quedan a la derecha, donde estaban. */}
      <ul className="ml-auto flex items-center gap-1">
        <li>{step('prev')}</li>
        {pageCount !== null && (
          <>
            {pageItems(page, pageCount).map((item, i) => (
              <li key={item === 'gap' ? `gap-${i}` : item} className="hidden sm:block">
                {item === 'gap' ? (
                  <span
                    className="inline-flex h-9 w-6 items-center justify-center text-muted-foreground"
                    aria-hidden="true"
                  >
                    …
                  </span>
                ) : item === page ? (
                  <span
                    aria-current="page"
                    className={cn(NUMBER, 'bg-foreground font-semibold text-background')}
                  >
                    {item + 1}
                  </span>
                ) : (
                  go(item, item + 1, {
                    ariaLabel: `Página ${item + 1}`,
                    className: cn(NUMBER, 'text-foreground hover:bg-accent'),
                  })
                )}
              </li>
            ))}
            <li
              className="px-2 text-sm tabular-nums text-muted-foreground sm:hidden"
              aria-hidden="true"
            >
              {page + 1} de {pageCount}
            </li>
          </>
        )}
        <li>{step('next')}</li>
      </ul>
    </nav>
  )
}

type PagerProps = {
  /** Nombre del `nav` ("Paginación de deudas"): lo usan los lectores de pantalla y los tests. */
  label: string
  /** Página que se está viendo, 0-based. */
  page: number
  className?: string
} & (
  | {
      /** Filas en total, sumando todas las páginas. */
      total: number
      pageSize: number
      /**
       * Filas dibujadas en esta página, si pueden no coincidir con el total
       * (el total sale de un COUNT aparte y la lista de otra query).
       */
      shown?: number
      hasMore?: never
    }
  | { hasMore: boolean; total?: never; pageSize?: never; shown?: never }
) &
  (
    | { hrefFor: (page: number) => string; onPageChange?: never }
    | { onPageChange: (page: number) => void; hrefFor?: never }
  )

type ControlExtra = { rel?: 'prev' | 'next'; ariaLabel?: string; className?: string }

const FOCUS = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'

const STEP = cn(
  'inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-md text-sm font-medium transition-colors sm:h-9 sm:px-2.5',
  FOCUS,
)

const NUMBER = cn(
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm tabular-nums transition-colors',
  FOCUS,
)

/** "26–50": el tramo que se ve. */
function rangeLabel(page: number, pageSize: number, total: number, shown?: number): string {
  if (total === 0 || shown === 0) return '0'
  const first = page * pageSize + 1
  const last = shown !== undefined ? first + shown - 1 : Math.min((page + 1) * pageSize, total)
  return `${first}–${last}`
}

/**
 * Qué números dibujar: siempre la primera y la última, la actual con una a cada
 * lado, y "…" en los huecos. Son siempre 7 lugares (o menos, si hay menos de 7
 * páginas), así la barra no cambia de ancho al avanzar.
 */
export function pageItems(current: number, count: number): Array<number | 'gap'> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i)
  const last = count - 1
  if (current <= 3) return [0, 1, 2, 3, 4, 'gap', last]
  if (current >= last - 3) return [0, 'gap', last - 4, last - 3, last - 2, last - 1, last]
  return [0, 'gap', current - 1, current, current + 1, 'gap', last]
}
