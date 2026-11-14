import { Skeleton } from '@/components/ui/skeleton'
import './explorar.css'

/** Carga de /explorar: la barra, el encabezado y 8 tarjetas con la forma de las reales. */
export default function Loading() {
  return (
    <div className="portal-ambient min-h-svh" aria-busy="true">
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-4 pb-10 sm:px-6 md:pt-10 lg:px-8">
        <Skeleton
          variant="glass"
          label="Cargando complejos…"
          className="h-[76px] rounded-[32px] md:w-[560px] md:rounded-full"
        />
        <div className="mt-6 mb-4 flex items-end justify-between gap-4 md:mt-8 md:mb-5" aria-hidden>
          <div className="min-w-0 flex-1">
            <Skeleton
              variant="glass"
              aria-hidden
              className="h-8 w-64 max-w-full rounded-xl md:h-10"
            />
            <Skeleton variant="glass" aria-hidden className="mt-2 h-4 w-80 max-w-full rounded-lg" />
          </div>
          <Skeleton variant="glass" aria-hidden className="h-11 w-26 shrink-0 rounded-full" />
        </div>
        <div className="ex-grid" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-painted overflow-hidden rounded-3xl">
              <Skeleton variant="glass" aria-hidden className="aspect-4/3 w-full rounded-none" />
              <div className="flex flex-col gap-2 px-3 pt-3 pb-3.5 md:px-3.5 md:pt-3.5 md:pb-4">
                <Skeleton variant="glass" aria-hidden className="h-4 w-3/4 rounded-md" />
                <Skeleton variant="glass" aria-hidden className="h-3 w-1/2 rounded-md" />
                <Skeleton variant="glass" aria-hidden className="h-3 w-2/5 rounded-md" />
                <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(62px,1fr))] gap-1.5">
                  <Skeleton variant="glass" aria-hidden className="h-11 rounded-full" />
                  <Skeleton variant="glass" aria-hidden className="h-11 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
