'use client'

import { useArtNow } from '@/hooks/use-art-now'
import { dayKeyOf, wallClock } from '@/lib/schedule/open-status'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { DAY_KEYS, DAY_LABELS_LONG } from '@/shared/time/week-days'

/**
 * Los horarios por día en vidrio pintado (`dl.week` del mockup), con el de hoy resaltado. Es una
 * isla de cliente porque la página es ISR: cuál es "hoy" lo sabe solo el reloj del visitante; antes
 * de hidratar ningún día se resalta (el resaltado es solo fondo y negrita, no cambia el alto). El
 * cierre a medianoche sale "00:00".
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
      className="glass-painted grid overflow-hidden rounded-3xl px-4.5 py-1.5 text-portal-ink"
    >
      {DAY_KEYS.filter((key) => openingHours[key]).map((key) => {
        const day = openingHours[key]
        const isToday = key === today
        return (
          <div
            key={key}
            aria-current={isToday ? 'date' : undefined}
            className={cn(
              'flex items-center justify-between gap-4 py-3 text-base not-first:border-t not-first:border-portal-inner-line',
              isToday && 'font-semibold',
            )}
          >
            <dt className={isToday ? 'text-portal-ink' : 'text-portal-muted'}>
              {DAY_LABELS_LONG[key]}
              {isToday && (
                <span className="ml-2 rounded-full bg-portal-slot px-2 py-0.5 text-[13px] font-semibold text-portal-slot-ink">
                  hoy
                </span>
              )}
            </dt>
            <dd className="font-semibold tabular-nums">
              {day.closed ? 'Cerrado' : `${wallClock(day.open)} – ${wallClock(day.close)}`}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
