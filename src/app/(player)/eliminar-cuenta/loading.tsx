import { Skeleton } from '@/components/ui/skeleton'

/** Esqueleto de Eliminar la cuenta en la misma columna que la vista: link de vuelta, título y las tarjetas de aviso. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6" role="status" aria-label="Cargando…">
      <div>
        <Skeleton aria-hidden className="h-11 w-40" />
        <Skeleton aria-hidden className="mt-1 h-8 w-64 max-w-full" />
      </div>
      <Skeleton aria-hidden className="h-[72px] w-full rounded-2xl" />
      <Skeleton aria-hidden className="h-[190px] w-full rounded-2xl" />
      <Skeleton aria-hidden className="h-[170px] w-full rounded-2xl" />
      <Skeleton aria-hidden className="h-12 w-full rounded-xl" />
    </div>
  )
}
