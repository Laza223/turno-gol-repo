import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton del perfil público. Vive dentro del grupo `(perfil)` por el STATUS
 * HTTP, no por prolijidad.
 *
 * Un `loading.tsx` mete un `<Suspense>` que cubre su segmento **y todo lo que
 * cuelga debajo**. Mientras este archivo estuvo en `[slug]/`, cualquier
 * `notFound()` de una ruta hermana salía con el 200 ya emitido en los headers:
 * un soft-404 indexable. Medido con sondas repetidas contra `next dev`, sobre
 * `/{slug}/torneos` de un complejo con el flag de Torneos apagado:
 *
 *   con este archivo en `[slug]/`          → 200  (cuerpo de "no encontrado")
 *   con este archivo en `[slug]/(perfil)/` → 404
 *
 * El grupo no cambia la URL: `(perfil)/page.tsx` sigue sirviendo `/{slug}`.
 * Encerrar la page del perfil y su skeleton acá deja a cada hermano decidiendo
 * su propio status. Es la misma trampa que ya documentó `[slug]/layout.tsx`,
 * un nivel más abajo: un layout queda fuera del boundary de SU segmento, no
 * del de un ancestro.
 *
 * De paso arregla algo que estaba mal igual: este skeleton es el del PERFIL
 * (galería, header, tarjetas de cancha) y se mostraba también al entrar a
 * `/torneos`, que no se le parece en nada.
 */

export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      aria-busy="true"
    >
      <div className="rounded-3xl border border-border/80 bg-muted/40 p-4 shadow-xs backdrop-blur-xs sm:p-6 lg:p-8 space-y-6">
        {/* Header skeleton */}
        <div className="space-y-4">
          <Skeleton className="h-48 sm:h-56 w-full rounded-xl" />
          <div className="flex items-start gap-4">
            <Skeleton className="h-14 w-14 rounded-lg shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>

        {/* Availability grid placeholder */}
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}
