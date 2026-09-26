import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Flechas de día de Caja › Cuentas (decisión del dueño, 2026-09-25). El día de
 * caja cambia al corte del complejo (en el Vagón, a la 01:00, la misma hora en
 * que cierra): sin esto, a la 01:05 la noche que terminó ya no se veía desde
 * ningún lado. "Día siguiente" se apaga en el día de hoy.
 */
export function DayStepper({
  label,
  prevHref,
  nextHref,
  className,
}: {
  label: string
  prevHref: string
  nextHref: string | null
  className?: string
}) {
  const icon = buttonVariants({ variant: 'ghost', size: 'icon' })
  return (
    <nav aria-label="Día de caja" className={cn('flex items-center gap-1', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={prevHref} aria-label="Día anterior" className={icon}>
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>Día anterior</TooltipContent>
      </Tooltip>
      <span
        aria-current="date"
        className="min-w-[8.5rem] text-center text-sm font-medium tabular-nums text-foreground"
      >
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          {nextHref ? (
            <Link href={nextHref} aria-label="Día siguiente" className={icon}>
              <ChevronRight aria-hidden className="h-4 w-4" />
            </Link>
          ) : (
            // `aria-disabled` y no `disabled`: un botón deshabilitado no recibe el
            // mouse y el tooltip que explica por qué no se abriría nunca.
            <span
              role="link"
              aria-disabled="true"
              aria-label="Día siguiente"
              tabIndex={0}
              className={cn(icon, 'cursor-not-allowed opacity-50 hover:bg-transparent')}
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent>{nextHref ? 'Día siguiente' : 'Ya estás en hoy'}</TooltipContent>
      </Tooltip>
    </nav>
  )
}
