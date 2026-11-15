'use client'

import './ficha.css'
import { useEffect, useRef } from 'react'
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

const SHORT_WEEKDAY = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })

/** "2026-10-16" → "Vie" (sin el punto que algunos ICU ponen a la abreviatura). */
const weekdayShort = (date: string) =>
  capitalizeFirst(SHORT_WEEKDAY.format(new Date(`${date}T12:00:00Z`)).replace('.', ''))

/**
 * La fila de días, de hoy a la anticipación del complejo (`.daystrip` de `ficha.css`). Cada día es
 * un botón con `aria-pressed`: la abreviatura ("Hoy", "Vie"), el número y, debajo, un punto verde
 * si hay lugar o el estado con palabras ("Completo", "Sin horarios", "Cerrado"). El nombre
 * accesible lo dice entero: "Viernes 16. Hay lugar" (texto `sr-only`).
 *
 * "Cerrado" sale del horario del complejo y se sabe al instante; el resto sale de la semana que se
 * pide por detrás: sin datos, con error o más allá de lo que trae, el día queda habilitado y sin
 * estado. Un día sin lugar no se puede elegir.
 *
 * El estado cuenta todas las canchas, sin el filtro de tamaño: un "Completo" por tamaño dejaría
 * apagado un día con lugar en otra cancha, sin que se vea por qué.
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
  /** El día elegido. */
  value: string
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

  // Si se entra con un día lejano (link compartido), la fila se corre hasta que se vea. Solo al
  // montar y solo en horizontal: `scrollIntoView` movería también la página.
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = strip.current
    const chosen = row?.querySelector('[aria-pressed=true]')
    if (!row || !(chosen instanceof HTMLElement)) return
    const overflow = chosen.offsetLeft + chosen.offsetWidth - (row.scrollLeft + row.clientWidth)
    if (overflow > 0) row.scrollLeft += overflow + 18
  }, [])

  return (
    <div ref={strip} role="group" aria-label="Día" className="daystrip">
      {Array.from({ length: advanceDays + 1 }, (_, i) => addDays(today, i)).map((date, i) => {
        const status = statusOf(date)
        const long = dayLong(date)
        const name = i === 0 ? `Hoy, ${long}` : capitalizeFirst(long)
        return (
          <button
            key={date}
            type="button"
            className="dayp"
            aria-pressed={date === value}
            disabled={status !== null && status !== 'room'}
            onClick={() => onPick(date)}
          >
            {/* Lo visible es abreviado ("Dom 15"); el lector de pantalla lee el día entero. Con un
                `aria-label` axe marca que el texto visible no está en el nombre. */}
            <small aria-hidden>{i === 0 ? 'Hoy' : weekdayShort(date)}</small>
            <b aria-hidden>{Number(date.slice(8))}</b>
            {status === 'room' ? (
              <i aria-hidden />
            ) : (
              status && <em aria-hidden>{STATUS_LABEL[status]}</em>
            )}
            <span className="sr-only">{status ? `${name}. ${STATUS_LABEL[status]}` : name}</span>
          </button>
        )
      })}
    </div>
  )
}
