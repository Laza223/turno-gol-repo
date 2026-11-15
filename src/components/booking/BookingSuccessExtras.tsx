'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { CalendarPlus, Navigation, Ticket } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { buildDirectionsHref } from '@/lib/booking/directions'
import { cn } from '@/lib/utils'
import { buildBookingIcs } from './booking-ics'

const BookingMiniMap = dynamic(() => import('./BookingMiniMap'), {
  ssr: false,
  loading: () => <div className="skeleton-glass h-44 w-full" aria-hidden />,
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

/** Enlace en píldora (`.link` del mockup): 44 px, con el ícono en verde. */
const LINK = cn(buttonVariants({ variant: 'pill-link', size: 'pill-sm' }))

/**
 * Las acciones secundarias de la reserva confirmada, en la fila de enlaces del mockup: Cómo llegar
 * (si hay dirección o coordenadas), Agregar al calendario (un `.ics` armado en el navegador) y Ver
 * mis reservas. Debajo, el mini mapa de la ubicación si el complejo cargó coordenadas, en vidrio
 * pintado. Ninguna compite con "Avisarle al grupo".
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
    <>
      <div className="rv-links">
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
            <Navigation aria-hidden />
            Cómo llegar
          </a>
        )}
        <button type="button" onClick={addToCalendar} className={LINK}>
          <CalendarPlus aria-hidden />
          Agregar al calendario
        </button>
        <Link href="/mis-reservas" className={LINK}>
          <Ticket aria-hidden />
          Ver mis reservas
        </Link>
      </div>
      {props.latitude != null && props.longitude != null && (
        <div className="rv-map glass-painted">
          <BookingMiniMap lat={props.latitude} lng={props.longitude} label={tenantName} />
        </div>
      )}
    </>
  )
}
