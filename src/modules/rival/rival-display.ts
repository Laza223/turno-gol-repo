// Lo que RIVAL muestra en pantalla: etiquetas, hora ART y agrupado del tablón.
// Todo puro (sin DB): el día SIEMPRE sale del reloj ART, nunca del día UTC.
import { capitalizeFirst } from '@/lib/format'
import { addDays } from '@/shared/dates/art'
import { artDateOf } from '@/shared/time/art-date'
import type { RivalReportReason } from './rival.schema'
import type { RivalLevel, RivalPosition, RivalSeeking, RivalSeekingPosition } from './rival.types'

const ART_OFFSET_MS = 3 * 3600_000

export const RIVAL_LEVEL_LABELS: Record<RivalLevel, string> = {
  tranqui: 'Tranqui',
  parejo: 'Parejo',
  picante: 'Picante',
}

export const RIVAL_REPORT_REASON_LABELS: Record<RivalReportReason, string> = {
  not_exists: 'El partido no existe',
  spam: 'Es spam o publicidad',
  offensive: 'Nombre o foto ofensivos',
  minor: 'Parece menor de 18',
}

export const RIVAL_POSITION_LABELS: Record<RivalPosition, string> = {
  goalkeeper: 'Arquero',
  defender: 'Defensor',
  midfielder: 'Mediocampista',
  forward: 'Delantero',
  any: 'Donde me pongan',
}

/** "HH:MM" de un instante, en hora argentina. */
export function artTimeOf(d: Date): string {
  return new Date(d.getTime() - ART_OFFSET_MS).toISOString().slice(11, 16)
}

/** Día ART + hora ART ("2026-10-24", "21:00") → el instante UTC. */
export function artInstantOf(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-03:00`)
}

const WEEKDAY_DAY = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  timeZone: 'UTC',
})

/** "2026-10-24" → "Sábado 24". */
export function dayLabel(date: string): string {
  return capitalizeFirst(WEEKDAY_DAY.format(new Date(`${date}T12:00:00Z`)))
}

const WEEKDAY = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' })

/** "2026-10-22" → "jueves" (minúscula, para meterlo en una frase). */
export function weekdayOf(date: string): string {
  return WEEKDAY.format(new Date(`${date}T12:00:00Z`))
}

/** "Hoy 21:00", "Mañana 21:00" o "Sábado 24 · 21:00". */
export function whenLabel(startsAt: Date, now: Date = new Date()): string {
  const day = artDateOf(startsAt)
  const today = artDateOf(now)
  const time = artTimeOf(startsAt)
  if (day === today) return `Hoy ${time}`
  if (day === addDays(today, 1)) return `Mañana ${time}`
  return `${dayLabel(day)} · ${time}`
}

/** El tipo de la tarjeta: "Faltan 3", "Falta 1", "Se busca arquero" o "Busca rival". */
export function matchTypeLabel(m: {
  seeking: RivalSeeking | null
  seekingPosition: RivalSeekingPosition | null
  capacity: number
  confirmedCount: number
}): string {
  if (m.seeking === 'rival') return 'Busca rival'
  if (m.seeking === 'players' && m.seekingPosition === 'goalkeeper') return 'Se busca arquero'
  return missingLabel(m.capacity - m.confirmedCount)
}

/** "Faltan 3" / "Falta 1" / "Completo". */
export function missingLabel(missing: number): string {
  if (missing <= 0) return 'Completo'
  return missing === 1 ? 'Falta 1' : `Faltan ${missing}`
}

export type BoardGroupKey = 'today' | 'tomorrow' | 'week'

const GROUP_LABELS: Record<BoardGroupKey, string> = {
  today: 'Hoy',
  tomorrow: 'Mañana',
  week: 'Esta semana',
}

/**
 * Hoy / Mañana / Esta semana, por día ART y ordenado por hora. Los grupos vacíos no
 * salen. `now` entra por parámetro para poder probar el borde de las 21:00 a 23:59 ART
 * (donde el día UTC ya es el siguiente).
 */
export function groupBoardByDay<T extends { id: string; startsAt: Date }>(
  items: T[],
  now: Date,
): { key: BoardGroupKey; label: string; items: T[] }[] {
  const today = artDateOf(now)
  const tomorrow = addDays(today, 1)
  const buckets: Record<BoardGroupKey, T[]> = { today: [], tomorrow: [], week: [] }
  const sorted = [...items].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
  )
  for (const item of sorted) {
    const day = artDateOf(item.startsAt)
    if (day < today) continue
    buckets[day === today ? 'today' : day === tomorrow ? 'tomorrow' : 'week'].push(item)
  }
  return (['today', 'tomorrow', 'week'] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: GROUP_LABELS[key], items: buckets[key] }))
}
