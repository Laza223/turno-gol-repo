'use client'

import { useArtNow } from '@/hooks/use-art-now'
import { dayKeyOf, wallClock } from '@/lib/schedule/open-status'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { DAY_KEYS, DAY_LABELS_LONG } from '@/shared/time/week-days'

/**
 * Los horarios por día, con el de hoy resaltado. Es una isla de cliente porque la página es ISR:
 * cuál es "hoy" lo sabe solo el reloj del visitante; antes de hidratar ningún día se resalta (el
 * resaltado es solo fondo y negrita, no cambia el alto). El cierre a medianoche sale "00:00".
 */
export default function OpeningHoursList({
  openingHours,
}: {
  openingHours: PublicTenant['openingHours']
}) {
  const { date } = useArtNow()
  const today = date ? dayKeyOf(date) : null

  return (
    <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {DAY_KEYS.filter((key) => openingHours[key]).map((key) => {
        const day = openingHours[key]
        const isToday = key === today
        return (
          <div
            key={key}
            aria-current={isToday ? 'date' : undefined}
            className={cn(
              'flex items-center justify-between gap-4 px-4 py-2.5',
              isToday && 'bg-muted font-semibold',
            )}
          >
            <dt className="text-sm text-foreground">
              {DAY_LABELS_LONG[key]}
              {isToday && <span className="ml-2 text-[13px] font-normal">hoy</span>}
            </dt>
            <dd
              className={cn(
                'text-sm tabular-nums',
                isToday ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {day.closed ? 'Cerrado' : `${wallClock(day.open)} – ${wallClock(day.close)}`}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
