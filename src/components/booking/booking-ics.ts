import { icsEscapeText } from './ics-escape'

// ART (UTC-3) → UTC en formato ICS: YYYYMMDDTHHMMSSZ. `time` '24:00' desborda al día siguiente.
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
 * El `.ics` de "Agregar al calendario". `startsOn` es el día CALENDARIO en que se juega (ART, de
 * `bookings.starts_at`), no el operativo: con `closes_next_day` el turno de 00:00 del día operativo D
 * se juega el D+1, y armarlo con `date` lo ponía en el calendario un día antes.
 */
export function buildBookingIcs(params: {
  slug: string
  tenantName: string
  courtName: string
  address: string
  city: string
  /** "YYYY-MM-DD", día físico. */
  startsOn: string
  /** "HH:MM:SS" o "HH:MM" */
  timeStart: string
  timeEnd: string
  dtStamp: string
}): string {
  const { slug, startsOn, timeStart, timeEnd } = params
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TurnoGol//Reservas//ES',
    'BEGIN:VEVENT',
    `UID:${slug}-${startsOn}-${timeStart.slice(0, 5)}@turnogol`,
    `DTSTAMP:${params.dtStamp}`,
    `DTSTART:${toIcsUtc(startsOn, timeStart)}`,
    `DTEND:${toIcsUtc(startsOn, timeEnd)}`,
    `SUMMARY:Fútbol en ${icsEscapeText(params.tenantName)} (${icsEscapeText(params.courtName)})`,
    `LOCATION:${icsEscapeText(params.address)}\\, ${icsEscapeText(params.city)}`,
    `DESCRIPTION:Reserva de cancha en ${icsEscapeText(params.tenantName)}.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
