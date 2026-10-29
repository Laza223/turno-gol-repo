'use client'

import { Check, ChevronRight } from 'lucide-react'
import { summarizeHours } from '@/lib/booking/hour-summary'
import { capitalizeFirst } from '@/lib/format'
import type { WeeklyAvailabilityResponse } from '@/modules/tenants/public.service'
import { addDays } from '@/shared/dates/art'
import { dayLong } from './ChipGroups'

type DayStatus = 'room' | 'full' | 'none' | 'closed'

const STATUS_LABEL: Record<DayStatus, string> = {
  room: 'Hay lugar',
  full: 'Completo',
  none: 'Sin horarios',
  closed: 'Cerrado',
}

// Elegido, el texto va en blanco pleno: al 80 % sobre el verde no llega a AA en el tema claro.
const DAY =
  'group flex min-h-16 w-full items-center gap-3 rounded-xl border border-input bg-card px-4 py-2 text-left text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground'

/**
 * Paso 1: un día por fila, a lo ancho. A la derecha el estado, siempre con palabras ("Hay lugar",
 * "Completo", "Sin horarios", "Cerrado"). "Cerrado" sale del horario del complejo y se sabe al
 * instante; el resto sale de la semana que se pide por detrás: sin datos, con error o más allá de
 * lo que trae, la fila queda habilitada y sin estado (la fila no cambia de alto cuando llega).
 *
 * El estado cuenta todas las canchas, sin el filtro de formato: el filtro vive en el paso 2 y acá
 * no se ve, así que un "Completo" por formato dejaría un día con lugar deshabilitado sin explicación.
 */
export default function DayList({
  today,
  advanceDays,
  value,
  week,
  isClosed,
  onPick,
}: {
  today: string
  advanceDays: number
  /** El día elegido antes (al volver desde el paso 2). */
  value: string | null
  week: WeeklyAvailabilityResponse | 'error' | undefined
  isClosed: (date: string) => boolean
  onPick: (date: string) => void
}) {
  const statusOf = (date: string): DayStatus | null => {
    if (isClosed(date)) return 'closed'
    const day = week && week !== 'error' ? week.days.find((d) => d.date === date) : undefined
    if (!day) return null
    const rows = summarizeHours(day.courts, null)
    return rows.length === 0 ? 'none' : rows.some((r) => r.freeCount > 0) ? 'room' : 'full'
  }

  return (
    <ul aria-label="Día" className="flex flex-col gap-2">
      {Array.from({ length: advanceDays + 1 }, (_, i) => addDays(today, i)).map((date, i) => {
        const status = statusOf(date)
        const chosen = date === value
        const disabled = status !== null && status !== 'room'
        const long = dayLong(date)
        return (
          <li key={date}>
            <button
              type="button"
              aria-pressed={chosen}
              disabled={disabled}
              onClick={() => onPick(date)}
              className={DAY}
            >
              <span className="min-w-0 flex-1">
                {i < 2 ? (
                  <>
                    <span className="block text-lg font-semibold leading-6">
                      {i === 0 ? 'Hoy' : 'Mañana'}
                    </span>
                    <span className="block text-sm leading-5 opacity-80 group-aria-pressed:opacity-100">
                      {long}
                    </span>
                  </>
                ) : (
                  <span className="block text-lg font-semibold leading-6">
                    {capitalizeFirst(long)}
                  </span>
                )}
              </span>
              {chosen && <Check className="size-5" aria-hidden />}
              {status && <span className="text-sm font-semibold">{STATUS_LABEL[status]}</span>}
              {!disabled && (
                <ChevronRight
                  className="size-5 opacity-70 group-aria-pressed:opacity-100"
                  aria-hidden
                />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
