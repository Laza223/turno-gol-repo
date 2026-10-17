'use client'

import Link from 'next/link'
import { CalendarPlus, Navigation, Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { icsEscapeText } from './ics-escape'

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

/**
 * Fila de la lista de secundarias: 48 px, plana, el foco adentro (el contenedor recorta). Cada
 * fila dice su acción; ninguna compite con "Avisarle al grupo".
 */
const ROW = cn(
  'flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-base font-semibold text-foreground',
  'hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
)
const ROW_ICON = 'size-5 shrink-0 text-muted-foreground'

/**
 * Las acciones secundarias de la reserva confirmada: Cómo llegar (si hay dirección o
 * coordenadas), Agregar al calendario (un `.ics` armado en el navegador) y Ver mis reservas.
 */
export default function BookingSuccessExtras(props: Props) {
  const { tenantName, courtName, slug, date, timeStart, timeEnd, address, city } = props
  const t1 = timeStart.slice(0, 5)

  const hasGeo = props.latitude != null && props.longitude != null
  const mapsQuery = hasGeo
    ? `${props.latitude},${props.longitude}`
    : encodeURIComponent(`${address}, ${city}`)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`

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

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {(hasGeo || address.trim() !== '') && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={ROW}>
          <Navigation className={ROW_ICON} aria-hidden />
          Cómo llegar
        </a>
      )}
      <button type="button" onClick={addToCalendar} className={ROW}>
        <CalendarPlus className={ROW_ICON} aria-hidden />
        Agregar al calendario
      </button>
      <Link href="/mis-reservas" className={ROW}>
        <Ticket className={ROW_ICON} aria-hidden />
        Ver mis reservas
      </Link>
    </div>
  )
}
