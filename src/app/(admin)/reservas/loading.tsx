import { Fragment } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton con la silueta REAL de /reservas (MASTER §6.7 "Loading"): header,
 * tabs de rango + toolbar, píldoras de estado y 2 secciones de filas.
 */
export default function ReservasLoading() {
  return (
    <div className="space-y-5">
      <div className="page-header-band relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton aria-hidden className="h-12 w-12 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Skeleton aria-hidden className="h-7 w-28" />
              <Skeleton aria-hidden className="h-4 w-40" />
            </div>
          </div>
          <Skeleton aria-hidden className="h-9 w-36" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton aria-hidden className="h-9 w-52 rounded-lg" />
        <Skeleton aria-hidden className="h-10 w-72 rounded-lg" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} aria-hidden className="h-7 w-24 rounded-full" />
        ))}
      </div>

      <div className="space-y-6" aria-hidden>
        {Array.from({ length: 2 }).map((_, s) => (
          <Fragment key={s}>
            <Skeleton className="h-4 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, r) => (
                <Skeleton key={r} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
