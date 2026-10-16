import { Skeleton } from '@/components/ui/skeleton'
import ProfileLayout from '../components/ProfileLayout'
import { ReserveSkeleton } from '../components/ReserveSection'

/**
 * Skeleton de la ficha: la misma silueta que la página (portada, nombre, chips, links y la
 * reserva), plano y sin blur. Vive dentro de `(perfil)` por el status HTTP, no por prolijidad:
 * un `loading.tsx` mete un `<Suspense>` que cubre su segmento y todo lo que cuelga debajo, y con
 * este archivo en `[slug]/` cualquier `notFound()` de una ruta hermana (`/{slug}/torneos` con el
 * flag apagado) salía con el 200 ya emitido: un soft-404 indexable. Medido contra `next dev`:
 * en `[slug]/` → 200; en `[slug]/(perfil)/` → 404. Mismo origen que `[slug]/layout.tsx`.
 */
export default function Loading() {
  return (
    <div aria-busy="true">
      <ProfileLayout
        hero={
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <div className="space-y-2">
              <Skeleton aria-hidden className="h-9 w-2/3" />
              <Skeleton aria-hidden className="h-5 w-1/2" />
            </div>
            <div className="flex gap-2">
              <Skeleton aria-hidden className="h-8 w-24 rounded-full" />
              <Skeleton aria-hidden className="h-8 w-28 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton aria-hidden className="h-11 w-36" />
              <Skeleton aria-hidden className="h-11 w-32" />
            </div>
          </div>
        }
        reserve={<ReserveSkeleton />}
      />
    </div>
  )
}
