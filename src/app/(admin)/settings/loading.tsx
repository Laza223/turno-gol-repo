import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta de `/settings/*` que no declara loading propio: la portada y las
 * páginas de Reservas y seña, Horarios, Página pública y Suscripción (Equipo
 * tiene el suyo). La barra superior la pone cada página por portal, así que
 * acá va solo el contenido: dos columnas de tarjetas con renglones, que es la
 * forma de la portada y a lo que se parecen las páginas en escritorio.
 */
export default function Loading() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" aria-busy="true">
      {Array.from({ length: 2 }).map((_, card) => (
        <div key={card} className="card-premium space-y-5 rounded-xl p-6">
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-56" />
          </div>
          {Array.from({ length: 3 }).map((_, row) => (
            <div key={row} className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-full max-w-xs" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
