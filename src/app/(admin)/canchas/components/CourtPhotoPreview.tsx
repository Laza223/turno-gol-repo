import CourtCard from '@/app/(public)/[slug]/components/CourtCard'
import type { PublicCourtCard } from '@/modules/tenants/public.service'

/**
 * Cómo sale la cancha en el perfil público, ahora mismo: con la primera foto
 * si hay, o con el fondo verde vacío si no. Usa la MISMA tarjeta que ve el
 * jugador (`CourtCard`), así que no se puede desincronizar del portal. Antes
 * el dueño subía la foto a ciegas —o no la subía nunca— sin ver que sin ella
 * la cancha es un fondo verde vacío.
 */
export function CourtPhotoPreview({
  court,
  photos,
}: {
  court: Omit<PublicCourtCard, 'photos'>
  photos: string[]
}) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs font-medium text-muted-foreground">
        Así la ve el jugador
      </figcaption>
      <div aria-hidden="true">
        <CourtCard court={{ ...court, photos }} />
      </div>
    </figure>
  )
}
