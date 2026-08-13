'use client'

import dynamic from 'next/dynamic'
import { CalendarPlus, MessageCircle, Navigation } from 'lucide-react'
import { icsEscapeText } from './ics-escape'

const BookingMiniMap = dynamic(() => import('./BookingMiniMap'), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse bg-muted" aria-hidden />,
})

type Props = {
  tenantName: string
  courtName: string
  slug: string
  /** "YYYY-MM-DD" */
  date: string
  /** "HH:MM:SS" o "HH:MM" */
  timeStart: string
  timeEnd: string
  address: string
  city: string
  latitude: number | null
  longitude: number | null
}

const dateLabel = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function parseDateOnly(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1)
}

// ART (UTC-3) → UTC en formato ICS: YYYYMMDDTHHMMSSZ
function toIcsUtc(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const dt = new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1, (hh ?? 0) + 3, mm ?? 0, 0))
  return dt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

export default function BookingSuccessExtras(props: Props) {
  const { tenantName, courtName, slug, date, timeStart, timeEnd, address, city } = props
  const t1 = timeStart.slice(0, 5)

  const mapsQuery =
    props.latitude != null && props.longitude != null
      ? `${props.latitude},${props.longitude}`
      : encodeURIComponent(`${address}, ${city}`)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`

  function shareWhatsApp() {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const text = `¡Reservé una cancha en ${tenantName}! ⚽ ${dateLabel.format(
      parseDateOnly(date),
    )} a las ${t1}. ¿Te sumás? ${origin}/${slug}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  function addToCalendar() {
    const dtStamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TurnoGol//Reservas//ES',
      'BEGIN:VEVENT',
      `UID:${slug}-${date}-${t1}@turnogol`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${toIcsUtc(date, timeStart)}`,
      `DTEND:${toIcsUtc(date, timeEnd)}`,
      `SUMMARY:Fútbol en ${icsEscapeText(tenantName)} (${icsEscapeText(courtName)})`,
      `LOCATION:${icsEscapeText(address)}\\, ${icsEscapeText(city)}`,
      `DESCRIPTION:Reserva de cancha en ${icsEscapeText(tenantName)}.`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reserva-${slug}-${date}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const hasGeo = props.latitude != null && props.longitude != null

  return (
    <div className="mt-6 w-full space-y-3">
      {hasGeo && (
        <div className="overflow-hidden rounded-xl border border-border shadow-xs">
          <BookingMiniMap lat={props.latitude!} lng={props.longitude!} label={tenantName} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={shareWhatsApp}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-green-800 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:bg-green-600 dark:hover:bg-green-500"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Compartir
        </button>
        <button
          type="button"
          onClick={addToCalendar}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent dark:bg-white/4 dark:hover:bg-white/8"
        >
          <CalendarPlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Calendario
        </button>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent dark:bg-white/4 dark:hover:bg-white/8"
        >
          <Navigation className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Cómo llegar
        </a>
      </div>
    </div>
  )
}
