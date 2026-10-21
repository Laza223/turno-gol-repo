'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { CalendarPlus, Navigation, Ticket } from 'lucide-react'
import { buildDirectionsHref } from '@/lib/booking/directions'
import { cn } from '@/lib/utils'
import { buildBookingIcs } from './booking-ics'

const BookingMiniMap = dynamic(() => import('./BookingMiniMap'), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse bg-muted" aria-hidden />,
})

type Props = {
  tenantName: string
  courtName: string
  slug: string
  /** "YYYY-MM-DD", día calendario en que se juega (no el operativo). */
  startsOn: string
  /** "HH:MM:SS" o "HH:MM" */
  timeStart: string
  timeEnd: string
  address: string
  city: string
  latitude: number | null
  longitude: number | null
}

/**
 * Fila de la lista de secundarias: 48 px, el foco adentro (el contenedor recorta). Cada fila dice
 * su acción; ninguna compite con "Avisarle al grupo".
 */
const ROW = cn(
  'flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-base font-semibold text-foreground',
  'hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-white/8',
)
const ROW_ICON = 'size-5 shrink-0 text-emerald-700 dark:text-emerald-400'

/**
 * Las acciones secundarias de la reserva confirmada: el mini-mapa de la ubicación (si el complejo
 * cargó coordenadas), Cómo llegar (si hay dirección o coordenadas), Agregar al calendario (un `.ics`
 * armado en el navegador) y Ver mis reservas.
 */
export default function BookingSuccessExtras(props: Props) {
  const { tenantName, courtName, slug, startsOn, timeStart, timeEnd, address, city } = props

  const mapsUrl = buildDirectionsHref(props)

  function addToCalendar() {
    const dtStamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
    const ics = buildBookingIcs({
      slug,
      tenantName,
      courtName,
      address,
      city,
      startsOn,
      timeStart,
      timeEnd,
      dtStamp,
    })

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reserva-${slug}-${startsOn}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      {props.latitude != null && props.longitude != null && (
        <div className="overflow-hidden rounded-xl border border-border shadow-xs">
          <BookingMiniMap lat={props.latitude} lng={props.longitude} label={tenantName} />
        </div>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card dark:divide-white/10 dark:bg-white/4">
        {mapsUrl && (
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
    </div>
  )
}
