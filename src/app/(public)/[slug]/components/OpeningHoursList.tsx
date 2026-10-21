'use client'

import { useArtNow } from '@/hooks/use-art-now'
import { dayKeyOf, wallClock } from '@/lib/schedule/open-status'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { DAY_KEYS, DAY_LABELS_LONG } from '@/shared/time/week-days'
import { PROFILE_CARD } from './styles'

/**
 * Los horarios por día, con el de hoy resaltado. Es una isla de cliente porque la página es ISR:
 * cuál es "hoy" lo sabe solo el reloj del visitante; antes de hidratar ningún día se resalta (el
 * resaltado es un tinte esmeralda y negrita, y la palabra «hoy» lo dice también; no cambia el alto).
 * El cierre a medianoche sale "00:00".
 */
export default function OpeningHoursList({
  openingHours,
}: {
  openingHours: PublicTenant['openingHours']
}) {
  const { date } = useArtNow()
  const today = date ? dayKeyOf(date) : null

  return (
    <dl
      data-testid="opening-hours"
      className={cn(PROFILE_CARD, 'divide-y divide-border overflow-hidden')}
    >
      {DAY_KEYS.filter((key) => openingHours[key]).map((key) => {
        const day = openingHours[key]
        const isToday = key === today
        return (
          <div
            key={key}
            aria-current={isToday ? 'date' : undefined}
            className={cn(
              'flex items-center justify-between gap-4 px-4 py-2.5',
              isToday && 'bg-emerald-500/10 font-semibold',
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
