'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type DisclosureProps = {
  /** Texto del encabezado (h2), siempre visible — tiene que decir qué hay adentro sin abrir. */
  heading: string
  /** Segunda línea opcional, también visible sin abrir. Se oculta en mobile si `hideHintOnMobile`. */
  hint?: string
  hideHintOnMobile?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

/**
 * Disclosure genérico para informes/reportes secundarios (H002/H003,
 * auditoría de coherencia 2026-09-09 §11: "los rankings, KPIs y estadísticas
 * son OCASIONALES; el que convive con la app quiere registrar y cobrar").
 *
 * A propósito NO es `@/components/ui/collapsible`: ese fuerza el montaje
 * (`forceMount` + `display:none`) para no perder inputs de un form al
 * colapsar. Acá no hay inputs — pero sí contenido que mide su propio layout
 * (`ResponsiveList` en `StockLedgerList`), y con `display:none` esa medición
 * da 0 y el layout queda mal armado hasta el próximo resize (mismo gotcha
 * documentado en el repo con Leaflet). Este disclosure DESMONTA el contenido
 * al cerrar en su lugar: se remonta limpio cada vez que se abre.
 */
export function Disclosure({
  heading,
  hint,
  hideHintOnMobile = false,
  defaultOpen = false,
  children,
  className,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <div className={cn('rounded-lg border border-border bg-card shadow-xs', className)}>
      <h2 className="text-sm font-semibold text-foreground">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-accent/50"
        >
          <span className="min-w-0">
            <span className="block">{heading}</span>
            {hint && (
              <span
                className={cn(
                  'mt-0.5 block text-xs font-normal text-muted-foreground',
                  hideHintOnMobile && 'hidden sm:block',
                )}
              >
                {hint}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      </h2>
      {open && (
        <div id={contentId} className="border-t border-border p-4">
          {children}
        </div>
      )}
    </div>
  )
}
