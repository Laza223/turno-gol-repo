import { Fragment } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton con la silueta REAL de la grilla (MASTER §5.3 "Espera"):
 * header + tira semanal + grid con eje horario y columnas de canchas.
 */
export default function GrillaLoading() {
  return (
    <main className="max-w-full px-4 py-4 space-y-4">
      {/* Header: título + fecha + acciones (densidad, Hoy) */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-14" />
        </div>
      </div>

      {/* Tira semanal: chevron + 7 píldoras + chevron */}
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-9 w-9 shrink-0" />
        <div className="flex min-w-0 flex-1 justify-center gap-1 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-11 shrink-0 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-9 w-9 shrink-0" />
      </div>

      {/* Grilla: eje horario + 3 columnas de canchas */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid gap-1 p-1" style={{ gridTemplateColumns: '3.5rem repeat(3, 1fr)' }}>
          {/* Header de canchas */}
          <div />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`h${i}`} className="h-8 w-full" />
          ))}
          {/* Filas de slots */}
          {Array.from({ length: 8 }).map((_, r) => (
            <Fragment key={`r${r}`}>
              <Skeleton className="mt-1 h-3 w-10 justify-self-end" />
              {Array.from({ length: 3 }).map((_, c) => (
                <Skeleton key={`c${r}-${c}`} className="h-12 w-full rounded-md" />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </main>
  )
}
