'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  /** Rótulo de la barra colapsada en mobile ("Tu complejo", "Tu semana"...). */
  title: string
  children: React.ReactNode
}

/**
 * Dónde vive el preview del paso, no qué muestra (eso lo decide cada tarjeta:
 * `PublicCardPreview`, `WeekPreview`, `GridPreview`). Split panel §E.1 del plan
 * de refactor de onboarding.
 *
 * Desktop: columna fija a la derecha, siempre visible — es la mitad de la
 * pantalla que hoy no muestra nada del producto.
 *
 * Mobile: barra sticky al pie, colapsada por defecto. En una pantalla chica el
 * form necesita toda la atención; el preview es un vistazo opcional, nunca un
 * bloqueo — pero tampoco desaparece: la barra queda siempre a mano para
 * abrirlo. `children` se renderiza dos veces (aside desktop / panel mobile),
 * igual que el indicador de progreso de `WizardShell`: cada copia vive
 * oculta por CSS (`display:none`) según el viewport, así que un lector de
 * pantalla nunca anuncia el mismo contenido dos veces.
 */
export function PreviewPane({ title, children }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      {/* aria-label: WizardShell ya tiene un <aside> (el rail de marca) — axe
          (landmark-unique) exige nombres distintos entre dos landmarks del
          mismo tipo implícito. */}
      <aside
        aria-label={title}
        className="hidden lg:sticky lg:top-8 lg:block lg:w-80 lg:shrink-0 lg:self-start"
      >
        {children}
      </aside>

      <div className="sticky bottom-0 -mx-4 mt-2 border-t border-border bg-card/95 px-4 pb-[env(safe-area-inset-bottom)] backdrop-blur-xs lg:hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-2 rounded py-3 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
            {title}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
        <div
          className={cn(
            'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
            expanded ? 'grid-rows-[1fr] pb-4' : 'grid-rows-[0fr]',
          )}
        >
          {/* tabIndex: región con scroll propio — sin esto, alguien con
              teclado no puede desplazarla si el contenido no entra en 50vh
              (axe: scrollable-region-focusable). */}
          <div className="max-h-[50vh] min-h-0 overflow-y-auto" tabIndex={0}>
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
