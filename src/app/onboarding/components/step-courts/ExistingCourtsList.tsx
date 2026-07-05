import { CheckCircle2 } from 'lucide-react'
import { formatArs } from '@/lib/format'
import type { CourtRow } from '@/modules/courts/court.types'
import { minPrice } from './constants'

/** Canchas ya creadas (revisita con "Volver"): se listan, no se editan acá. */
export function ExistingCourtsList({ courts }: { courts: CourtRow[] }) {
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {courts.map((court) => {
          const price = minPrice(court)
          return (
            <li key={court.id} className="flex items-center gap-3 px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span className="flex-1 truncate text-sm font-medium text-foreground">
                {court.name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                Fútbol {court.format}
                {price != null && <> · {formatArs(price)}</>}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Estas ya están creadas — las editás después desde Canchas.
      </p>
    </div>
  )
}
