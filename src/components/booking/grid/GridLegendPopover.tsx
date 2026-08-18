'use client'

import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { GridLegend } from './GridLegend'

/**
 * F-005 (QA prod 2026-08-17, punto 3): la leyenda de estados era una fila FIJA
 * debajo de la grilla — en 1366×768 le sacaba una línea entera de alto a la
 * matriz (junto con el banner de push, ver F-005 punto 2 en
 * PushNotificationManager.tsx). Detrás de un popover a demanda ocupa cero
 * espacio permanente; `GridLegend` en sí no cambia (mismo componente, misma
 * story) — solo cambia de dónde se monta.
 */
export function GridLegendPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          ¿Qué significa cada color?
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <GridLegend />
      </PopoverContent>
    </Popover>
  )
}
