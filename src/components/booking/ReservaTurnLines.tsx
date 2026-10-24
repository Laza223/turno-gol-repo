import { formatDateLong } from '@/lib/format'

/**
 * Qué turno es, en dos renglones (cuándo y dónde), para la vuelta de una reserva que todavía no se
 * confirmó: "Sábado, 25 de octubre · 21:00 a 22:00" / "Cancha 2 · El Vagón". Sin puntos sueltos al
 * empezar una línea ni "Cancha / E2E 1".
 */
export function ReservaTurnLines({
  startsOn,
  timeStart,
  timeEnd,
  courtName,
  tenantName,
}: {
  /** "YYYY-MM-DD", el día CALENDARIO en que se juega (de `starts_at`). */
  startsOn: string
  timeStart: string
  timeEnd: string
  courtName: string
  /** El complejo, para quien llega sin haber visto la ficha (/pendiente). */
  tenantName?: string
}) {
  return (
    <p className="font-medium text-foreground">
      <span className="block">
        {formatDateLong(startsOn)} ·{' '}
        <span className="whitespace-nowrap">
          {timeStart.slice(0, 5)} a {timeEnd.slice(0, 5)}
        </span>
      </span>{' '}
      <span className="block">
        {courtName}
        {tenantName ? ` · ${tenantName}` : ''}
      </span>
    </p>
  )
}
