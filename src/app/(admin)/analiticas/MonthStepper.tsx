import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Flechas de mes de Métricas. Cuelgan del hueco de la barra desde `lg` y bajan
 * arriba del contenido en el teléfono, igual que las de día de Caja › Cuentas
 * (`DayStepper`). "Mes siguiente" se apaga en el mes en curso.
 */
export function MonthStepper({
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
    <nav aria-label="Mes" className={cn('flex items-center gap-1', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={prevHref} aria-label="Mes anterior" className={icon}>
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>Mes anterior</TooltipContent>
      </Tooltip>
      <span
        aria-current="date"
        className="min-w-[9rem] text-center text-sm font-medium tabular-nums text-foreground"
      >
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          {nextHref ? (
            <Link href={nextHref} aria-label="Mes siguiente" className={icon}>
              <ChevronRight aria-hidden className="h-4 w-4" />
            </Link>
          ) : (
            // `aria-disabled` y no `disabled`: un botón deshabilitado no recibe el
            // mouse y el tooltip que explica por qué no se abriría nunca.
            <button
              type="button"
              aria-disabled="true"
              aria-label="Mes siguiente"
              className={cn(icon, 'cursor-not-allowed opacity-50 hover:bg-transparent')}
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent>{nextHref ? 'Mes siguiente' : 'Es el mes en curso'}</TooltipContent>
      </Tooltip>
    </nav>
  )
}
