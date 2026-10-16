import Image from 'next/image'
import { formatLabel, surfaceLabel } from '@/components/public/courtFacets'
import { formatArs } from '@/lib/format'
import type { PublicCourtCard } from '@/modules/tenants/public.service'

/**
 * Cancha con foto en la ficha del complejo: plana, la foto manda. El precio ya viene en `null`
 * del servidor cuando el complejo los oculta. `CourtCard` (admin y onboarding) no se toca.
 */
export default function CourtTile({ court, photo }: { court: PublicCourtCard; photo: string }) {
  return (
    <li>
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-muted">
        <Image
          src={photo}
          alt={court.name}
          fill
          sizes="(min-width: 640px) 240px, 50vw"
          className="object-cover"
        />
      </div>
      <h3 className="mt-2 text-base font-semibold text-foreground">{court.name}</h3>
      <p className="text-[13px] leading-5 text-muted-foreground">
        {formatLabel(court.format)} · {surfaceLabel(court.surfaceType)}
      </p>
      {court.fromPriceCents != null && (
        <p className="text-[13px] leading-5 text-foreground">
          Desde{' '}
          <span className="font-semibold tabular-nums">{formatArs(court.fromPriceCents)}</span>
        </p>
      )}
    </li>
  )
}
