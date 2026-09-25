import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Un renglón de datos chicos separados por "·" ("Cancha 1 · 21:00–22:00 · En juego")
 * que baja de línea sin dejar un "·" colgando al final ni al principio.
 *
 * Cada dato lleva su "·" adelante, corrido hacia la izquierda el ancho del
 * separador, y el renglón recorta lo que sobresale: el "·" del primer dato de
 * cada línea queda afuera de la vista. Los datos vacíos no se muestran.
 */
export function MetaLine({ parts, className }: { parts: ReactNode[]; className?: string }) {
  const shown = parts.filter(
    (part) => part !== null && part !== undefined && part !== false && part !== '',
  )
  return (
    <span
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-0.5 overflow-hidden', className)}
    >
      {shown.map((part, i) => (
        <span key={i} className="-ml-3 inline-flex min-w-0 items-center">
          <span aria-hidden className="w-3 shrink-0 text-center">
            ·
          </span>
          {typeof part === 'string' ? <span className="min-w-0">{part}</span> : part}
        </span>
      ))}
    </span>
  )
}
