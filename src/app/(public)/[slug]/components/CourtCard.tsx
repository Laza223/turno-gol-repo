import Image from 'next/image'
import { Users } from 'lucide-react'
import type { PublicCourtCard } from '@/modules/tenants/public.service'
import { formatLabel, surfaceLabel } from '@/components/public/courtFacets'
import { formatFromPrice } from '@/lib/format'

/** Tarjeta de cancha individual en el perfil del complejo. */
export default function CourtCard({ court }: { court: PublicCourtCard }) {
  const photo = court.photos[0]
  const fromPrice = formatFromPrice(court.fromPriceCents)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        {photo ? (
          <Image
            src={photo}
            alt={`Cancha ${court.name}`}
            fill
            sizes="(max-width: 640px) 50vw, 240px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 text-emerald-600/40">
            <Users className="h-8 w-8" aria-hidden />
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <h3 className="text-sm font-semibold text-slate-900">{court.name}</h3>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
            {formatLabel(court.format)}
          </span>
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/15">
            {surfaceLabel(court.surfaceType)}
          </span>
        </div>
        {fromPrice && (
          <p className="text-sm font-semibold text-slate-900 tabular-nums">{fromPrice}</p>
        )}
      </div>
    </div>
  )
}
