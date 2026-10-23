// El texto de "Avisar al grupo" (spec §5.3). Puro: el día y la hora salen del reloj ART.
import { capitalizeFirst } from '@/lib/format'
import { buildGroupShareHref } from '@/lib/booking/group-share'
import { artDateOf } from '@/shared/time/art-date'
import { artTimeOf, weekdayOf } from './rival-display'

export type ShareMatch = {
  startsAt: Date
  tenantName: string
  capacity: number
  confirmedCount: number
}

/** El mensaje cambia con el estado: faltan varios, falta uno o lleno (sin link: ya no hay a quién convocar). */
export function buildShareMessage(m: ShareMatch, url: string): string {
  const when = `${weekdayOf(artDateOf(m.startsAt))} ${artTimeOf(m.startsAt)}`
  const missing = m.capacity - m.confirmedCount
  if (missing <= 0) {
    return `¡Estamos los ${m.capacity}! Se juega el ${when} en ${m.tenantName}.`
  }
  if (missing === 1) {
    return `¡Falta 1! ${capitalizeFirst(when)} en ${m.tenantName}: ${url}`
  }
  return `${capitalizeFirst(when)} en ${m.tenantName}. Nos faltan ${missing}. ¿Venís? Confirmá en un toque: ${url}`
}

/** `wa.me/?text=…` sin número: WhatsApp pide a qué grupo mandarlo. */
export function buildShareHref(m: ShareMatch, url: string): string {
  return buildGroupShareHref(buildShareMessage(m, url))
}
