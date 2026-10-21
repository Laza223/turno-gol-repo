import Image from 'next/image'
import { formatLabel, surfaceLabel } from '@/components/public/courtFacets'
import { formatArs } from '@/lib/format'
import type { PublicCourtCard } from '@/modules/tenants/public.service'

/**
 * Cancha con foto en la ficha del complejo (La Previa): tarjeta con la foto arriba. Quieta al pasar el mouse: no es un link y no tiene que parecerlo. El precio ya viene en `null`
 * del servidor cuando el complejo los oculta. `CourtCard` (admin y onboarding) no se toca.
 */
export default function CourtTile({ court, photo }: { court: PublicCourtCard; photo: string }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
        <Image
          src={photo}
          alt={court.name}
          fill
          sizes="(min-width: 640px) 240px, 50vw"
          className="object-cover"
        />
      </div>
      <div className="space-y-0.5 p-3">
        <h3 className="text-base font-semibold text-foreground">{court.name}</h3>
        <p className="text-[13px] leading-5 text-muted-foreground">
          {formatLabel(court.format)} · {surfaceLabel(court.surfaceType)}
        </p>
        {court.fromPriceCents != null && (
          <p className="text-[13px] leading-5 text-foreground">
            Desde{' '}
            <span className="font-display text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatArs(court.fromPriceCents)}
            </span>
          </p>
        )}
      </div>
    </li>
  )
}
