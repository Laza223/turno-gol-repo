import { Skeleton } from '@/components/ui/skeleton'
import { PORTAL_COLUMN } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'

/** Esqueleto de Eliminar la cuenta en la misma columna que la vista: link de vuelta, título, la explicación y el botón. */
export default function Loading() {
  return (
    <div className={cn(PORTAL_COLUMN, 'pb-12 pt-6')} role="status" aria-label="Cargando…">
      <Skeleton aria-hidden className="h-11 w-40" />
      <Skeleton aria-hidden className="mt-2 h-9 w-64 max-w-full" />
      <Skeleton aria-hidden className="mt-2 h-6 w-full" />
      <Skeleton aria-hidden className="mt-8 h-7 w-56" />
      <Skeleton aria-hidden className="mt-2 h-24 w-full" />
      <Skeleton aria-hidden className="mt-10 h-11 w-44" />
    </div>
  )
}
