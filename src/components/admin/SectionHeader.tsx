import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Encabezado de una sección de trabajo del panel: título, un dato al lado y
 * las acciones de esa sección.
 *
 * Es el reemplazo de la card con borde y sombra que envolvía cada bloque. La
 * forma sale de `dashboard/ProximosTurnos.tsx`, que ya la tenía inline: `h2` a
 * la izquierda, la métrica a la derecha, una línea de 1 px abajo. Acá se
 * extrae sin la card para que el contenido apoye sobre el fondo de la página.
 *
 * Deliberadamente NO acepta ícono: un ícono al lado de un título no informa
 * nada y es la firma visual que este rediseño viene a sacar
 * (`docs/planning/2026-09-17-plan-diseno-sacar-lo-generico.md` §2).
 *
 * `meta` va al lado del título, no debajo: es el número que contesta la
 * pregunta del título ("Deudas · $ 140.300 · 14 personas") y separarlo en dos
 * renglones lo desconecta de lo que califica.
 */
export function SectionHeader({
  id,
  title,
  meta,
  actions,
  className,
}: {
  /** `id` del `h2`, para colgar el `aria-labelledby` de la sección. */
  id?: string
  title: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border pb-2',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id={id} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        {meta ? <div className="text-sm tabular-nums text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
