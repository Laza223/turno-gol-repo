import Image from 'next/image'
import { Users } from 'lucide-react'
import type { PublicCourtCard } from '@/modules/tenants/public.service'
import { formatLabel, surfaceLabel } from '@/components/public/courtFacets'
import { formatFromPrice, formatPerPlayer } from '@/lib/format'

/** Tarjeta de cancha individual en el perfil del complejo. */
export default function CourtCard({ court }: { court: PublicCourtCard }) {
  const photo = court.photos[0]
  const fromPrice = formatFromPrice(court.fromPriceCents)
  const perPlayer = formatPerPlayer(court.fromPriceCents, [court.format])

  return (
    <div className="group overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-lg hover:shadow-emerald-500/10 motion-reduce:hover:translate-y-0">
      <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
        {photo ? (
          <Image
            src={photo}
            alt={`Cancha ${court.name}`}
            fill
            sizes="(max-width: 640px) 50vw, 240px"
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            className="relative flex h-full w-full items-center justify-center overflow-hidden text-emerald-300/70"
            style={{
              background:
                'radial-gradient(130% 130% at 78% 0%, rgba(16,185,129,.42), transparent 58%), linear-gradient(140deg, #065f46, #022c22)',
            }}
          >
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <Users className="relative h-8 w-8" aria-hidden />
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <h3 className="text-sm font-semibold text-foreground">{court.name}</h3>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
            {formatLabel(court.format)}
          </span>
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
            {surfaceLabel(court.surfaceType)}
          </span>
        </div>
        {fromPrice && (
          <div>
            <p className="font-display text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{fromPrice}</p>
            {perPlayer && (
              <p className="text-[11px] tabular-nums text-muted-foreground">{perPlayer}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
