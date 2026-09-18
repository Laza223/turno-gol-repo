import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Paginador del panel: "Anteriores · Página N · Siguientes".
 *
 * Vivía copiado a mano en `/jugadores` y `/reservas`, con las mismas clases y
 * el mismo markup; Caja lo necesitaba en tres listas más. Sale acá con la forma
 * que ya tenían esas dos pantallas, sin cambiar un texto: sus tests anclan en
 * "Anteriores" / "Siguientes" dentro de un `nav` con nombre propio.
 *
 * Dos modos, según dónde viven las filas:
 *
 * - `hrefFor`: la página va en la URL y la trae el servidor (`LIMIT n+1`, el
 *   sobrante es `hasMore`). Es un link de verdad: se puede abrir en otra
 *   pestaña y el botón "atrás" vuelve a la página anterior.
 * - `onPageChange`: las filas ya están todas en el cliente y la página es solo
 *   cuánto se dibuja (las deudas de Cuentas, que se filtran por nombre y origen
 *   sobre la lista entera — paginar en el servidor filtraría solo la página).
 *
 * No se dibuja si hay una sola página: un "Página 1" solitario es ruido.
 */
export function Pager({
  label,
  page,
  hasMore,
  summary,
  className,
  hrefFor,
  onPageChange,
}: {
  /** Nombre del `nav` ("Paginación de deudas"): lo usan los lectores de pantalla y los tests. */
  label: string
  /** Página que se está viendo, 0-based. */
  page: number
  hasMore: boolean
  /** Reemplaza al "Página N" del medio, p. ej. "1–25 de 47". */
  summary?: ReactNode
  className?: string
} & (
  | { hrefFor: (page: number) => string; onPageChange?: never }
  | { onPageChange: (page: number) => void; hrefFor?: never }
)) {
  if (page <= 0 && !hasMore) return null

  const control = (target: number, rel: 'prev' | 'next', children: ReactNode) =>
    hrefFor ? (
      <Link href={hrefFor(target)} rel={rel} className={PAGER_CONTROL}>
        {children}
      </Link>
    ) : (
      <button type="button" onClick={() => onPageChange?.(target)} className={PAGER_CONTROL}>
        {children}
      </button>
    )

  return (
    <nav
      aria-label={label}
      className={cn(
        'flex items-center justify-between gap-3 border-t border-border pt-3',
        className,
      )}
    >
      {page > 0 ? (
        control(
          page - 1,
          'prev',
          <>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Anteriores
          </>,
        )
      ) : (
        <span />
      )}
      <span className="text-xs tabular-nums text-muted-foreground">
        {summary ?? `Página ${page + 1}`}
      </span>
      {hasMore ? (
        control(
          page + 1,
          'next',
          <>
            Siguientes
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </>,
        )
      ) : (
        <span />
      )}
    </nav>
  )
}

const PAGER_CONTROL =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'

/** "1–25 de 47": el tramo que se ve, para el medio del paginador. */
export function pageRangeLabel(page: number, pageSize: number, total: number): string {
  const first = total === 0 ? 0 : page * pageSize + 1
  const last = Math.min((page + 1) * pageSize, total)
  return `${first}–${last} de ${total}`
}
