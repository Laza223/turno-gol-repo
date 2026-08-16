import { MapPin, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  name: string
  address: string
  city: string
}

/**
 * Vista previa del paso 1: la tarjeta pública tal como la va a ver un jugador
 * en `/explorar`, armándose en vivo mientras el dueño escribe.
 *
 * NO es `FeaturedComplexCard` (esa pide `PublicTenantCard` completo: precio
 * "desde", amenities, rating, foto de portada — nada de eso existe todavía en
 * el paso 1, y fabricarlo sería mentir sobre el producto real). Reusa su MISMO
 * lenguaje visual (`card-premium`, `mockup-cover`, iniciales fantasma) para que
 * el paso 1 y `/explorar` se sientan la misma superficie, con solo los tres
 * datos que este paso realmente pide.
 */
export function PublicCardPreview({ name, address, city }: Props) {
  const displayName = name.trim() || 'Tu complejo'
  const hasName = name.trim().length > 0
  const initials = displayName.slice(0, 2).toUpperCase()
  const location = [address.trim(), city.trim()].filter(Boolean).join(' · ')

  return (
    <div className="card-premium overflow-hidden rounded-[20px]">
      <div className="mockup-cover relative h-[120px] overflow-hidden">
        <div aria-hidden className="player-hero-grid absolute inset-0 bg-size-[28px_28px]" />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 left-4 font-display font-black italic leading-none text-emerald-950/12 dark:text-white/[.14]"
          style={{ fontSize: '44px', letterSpacing: '-0.04em' }}
        >
          {initials}
        </span>
        <div className="absolute left-3 top-3">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
            <Zap className="h-3 w-3" aria-hidden />
            Reserva online
          </span>
        </div>
      </div>

      <div className="p-4">
        <h3
          className={cn(
            'font-display text-base font-bold',
            hasName ? 'text-foreground' : 'italic text-muted-foreground',
          )}
        >
          {displayName}
        </h3>
        {location ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin
              className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400"
              aria-hidden
            />
            <span className="truncate">{location}</span>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">Así te van a ver los jugadores.</p>
        )}
      </div>
    </div>
  )
}
