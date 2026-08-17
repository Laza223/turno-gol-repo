import { Skeleton } from '@/components/ui/skeleton'

/**
 * Fallback de carga para TODO el panel: cubre las rutas de `(admin)` que no
 * declaran uno propio.
 *
 * Antes de esto solo 7 de 34 páginas tenían `loading.tsx`, y la ausencia costaba
 * dos veces. La visible: como toda página del panel es dinámica (lee cookies
 * para resolver la sesión), sin este boundary el navegador se queda mostrando la
 * pantalla ANTERIOR hasta que la nueva terminó de renderizarse entera en el
 * servidor — se lee como "no pasó nada" y el usuario vuelve a hacer click. La
 * invisible: el prefetch de `<Link>` sobre una ruta dinámica solo llega hasta el
 * `loading.tsx` más cercano, así que sin boundary no cachea NADA y el click paga
 * el render completo en frío.
 *
 * Silueta genérica a propósito (page-header-band + bloque de contenido): es la
 * forma que comparten todas las pantallas del panel. Las que tienen una silueta
 * bien distinta (grilla, caja, jugadores, analíticas, hoy, configuración)
 * declaran la suya y ganan por proximidad.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      {/* PageHeader: icon halo + título + subtítulo */}
      <div className="page-header-band relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </div>

      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
