import { Skeleton } from '@/components/ui/skeleton'
import ProfileLayout from '../components/ProfileLayout'
import { ReserveSkeleton } from '../components/ReserveSection'

/**
 * Skeleton de la ficha: la misma silueta que la página nueva (la tarjeta de vidrio con el nombre,
 * sus datos y los enlaces; la reserva; y debajo los tiles de las canchas), con el brillo de carga.
 * Vive dentro de `(perfil)` por el status HTTP, no por prolijidad:
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
          <div className="glass-painted grid gap-3.5 rounded-[32px] p-5 md:p-7">
            <div className="grid gap-2.5">
              <Skeleton variant="glass" className="h-10 w-2/3 rounded-xl" />
              <Skeleton variant="glass" aria-hidden className="h-5 w-1/2 rounded-lg" />
              <Skeleton variant="glass" aria-hidden className="h-5 w-2/5 rounded-lg" />
            </div>
            <div className="flex gap-2">
              <Skeleton variant="glass" aria-hidden className="h-11 w-36 rounded-full" />
              <Skeleton variant="glass" aria-hidden className="h-11 w-32 rounded-full" />
            </div>
          </div>
        }
        reserve={<ReserveSkeleton />}
        rest={
          <div className="grid grid-cols-2 gap-2.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="glass" aria-hidden className="h-[74px] rounded-[22px]" />
            ))}
          </div>
        }
      />
    </div>
  )
}
