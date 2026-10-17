import { formatLabel } from '@/components/public/courtFacets'
import { formatDayHeader } from '@/lib/format'

export type GroupShareData = {
  tenantName: string
  courtName: string
  /** Jugadores por lado de la cancha (`courts.format`). */
  courtFormat: number
  /** "YYYY-MM-DD": el día calendario en que se juega (físico), no el operativo. */
  date: string
  /** "HH:MM:SS" o "HH:MM" */
  timeStart: string
  timeEnd: string
  address: string
  city: string
  /** Link absoluto del complejo (`https://…/<slug>`); lo arma quien llama con el origen de la app. */
  complexUrl: string
}

/**
 * El mensaje de "Avisarle al grupo". Sin montos, a propósito: sirve igual para todos los
 * complejos, con los precios ocultos o no. El link va solo en la última línea, para que WhatsApp
 * le arme la vista previa.
 */
export function buildGroupShareText(data: GroupShareData): string {
  const where = [data.address, data.city]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
  return [
    '¡Ya tenemos cancha! ⚽',
    `Jugamos el ${formatDayHeader(data.date)}, de ${data.timeStart.slice(0, 5)} a ${data.timeEnd.slice(0, 5)}.`,
    `${data.courtName} · ${formatLabel(data.courtFormat)}`,
    where ? `${data.tenantName} · ${where}` : data.tenantName,
    data.complexUrl,
  ].join('\n')
}

/** Link `wa.me` sin número: WhatsApp pide a quién mandárselo (el grupo). */
export function buildGroupShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
