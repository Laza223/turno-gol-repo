import { ImagePlus } from 'lucide-react'
import CourtCard from '@/app/(public)/[slug]/components/CourtCard'
import type { PublicCourtCard } from '@/modules/tenants/public.service'

/**
 * Vista previa de cómo sale la cancha en el perfil público, con y sin foto. Usa
 * la MISMA tarjeta que ve el jugador (`CourtCard`), así que no se puede
 * desincronizar de lo que muestra el portal. Antes el dueño subía la foto a
 * ciegas —o no la subía nunca— sin ver que sin ella la cancha es un fondo verde
 * vacío.
 */
export function CourtPhotoPreview({
  court,
  photos,
}: {
  court: Omit<PublicCourtCard, 'photos'>
  photos: string[]
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Así lo ve el jugador en tu perfil</p>
      <div aria-hidden="true" className="grid max-w-md grid-cols-2 gap-3">
        <figure className="flex flex-col gap-1.5">
          <CourtCard court={{ ...court, photos: [] }} />
          <figcaption className="text-center text-xs text-muted-foreground">Sin foto</figcaption>
        </figure>
        <figure className="flex flex-col gap-1.5">
          {photos.length > 0 ? (
            <CourtCard court={{ ...court, photos }} />
          ) : (
            <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border px-3 text-center text-muted-foreground">
              <ImagePlus className="h-5 w-5" />
              <span className="text-xs">Elegí una foto para ver cómo queda</span>
            </div>
          )}
          <figcaption className="text-center text-xs text-muted-foreground">Con tu foto</figcaption>
        </figure>
      </div>
    </div>
  )
}
