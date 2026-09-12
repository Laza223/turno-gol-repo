import { Fragment } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton con la silueta REAL de la grilla (MASTER §5.3 "Espera").
 *
 * Desde el rediseño (pages/grilla.md §1) la vista NO tiene encabezado propio: el
 * segmento, la tira semanal y el chip viven en la barra superior del panel, que
 * ya está pintada cuando este skeleton aparece. Dibujarlos acá de nuevo —como
 * hacía la versión anterior, con título, fecha, densidad y las siete píldoras—
 * mostraba cuatro filas que la página real no tiene, así que la grilla saltaba
 * hacia arriba al terminar de cargar. La silueta es la matriz y nada más.
 *
 * La fila de navegación de día (`‹ fecha ›`) sí se dibuja, pero sólo abajo de
 * `lg`: ahí la barra superior no la tiene y es parte del contenido.
 */
export default function GrillaLoading() {
  return (
    <main className="max-w-full space-y-2">
      {/* Teléfono: ‹ fecha › — la barra superior no la muestra en este ancho. */}
      <div className="flex items-center gap-1 lg:hidden">
        <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
        <Skeleton className="h-6 min-w-0 flex-1 rounded-lg" />
        <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
      </div>

      {/* Matriz: eje horario + columnas de canchas, con las medidas de §4. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div
          className="grid gap-1 p-1 [--tg-col:3rem] [--tg-hours:2.75rem] lg:[--tg-col:8.5rem] lg:[--tg-hours:3.5rem]"
          style={{ gridTemplateColumns: 'var(--tg-hours) repeat(3, minmax(var(--tg-col), 1fr))' }}
        >
          {/* Header de canchas */}
          <div />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`h${i}`} className="h-8 w-full" />
          ))}
          {/* Filas de slots: 4rem de alto, igual que rowHeightRem. */}
          {Array.from({ length: 8 }).map((_, r) => (
            <Fragment key={`r${r}`}>
              <Skeleton className="mt-1 h-3 w-8 justify-self-end" />
              {Array.from({ length: 3 }).map((_, c) => (
                <Skeleton key={`c${r}-${c}`} className="h-[3.75rem] w-full rounded-md" />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </main>
  )
}
