import { formatLabel } from '@/components/public/courtFacets'
import { formatArs } from '@/lib/format'
import type { PublicCourtCard } from '@/modules/tenants/public.service'

/**
 * Cancha de la ficha del complejo: un tile de vidrio pintado, de puro texto (`.tile` del mockup).
 * El precio ya viene en `null` del servidor cuando el complejo los oculta. `CourtCard` (admin y
 * onboarding) no se toca.
 */
export default function CourtTile({ court }: { court: PublicCourtCard }) {
  return (
    <li className="glass-painted grid content-start gap-0.5 rounded-[22px] px-4 py-3.5 text-portal-ink">
      <h3 className="text-[17px] leading-6 font-semibold [overflow-wrap:anywhere]">{court.name}</h3>
      <p className="text-sm leading-5 text-portal-soft">
        {formatLabel(court.format)} · {court.isCovered ? 'Techada' : 'Descubierta'}
      </p>
      {court.fromPriceCents != null && (
        <p className="text-sm leading-5 text-portal-soft">
          Desde{' '}
          <span className="font-semibold text-portal-ink tabular-nums">
            {formatArs(court.fromPriceCents)}
          </span>
        </p>
      )}
    </li>
  )
}
