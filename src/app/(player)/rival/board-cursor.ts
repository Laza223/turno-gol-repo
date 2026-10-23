import { uuid } from '@/shared/validation/primitives'
import type { RivalBoardCursor } from '@/modules/rival/rival.types'

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

/** `?despues=<startsAtISO>_<id>`: el ISO no lleva guion bajo, así que el primero separa. */
export function encodeBoardCursor(cursor: RivalBoardCursor): string {
  return `${cursor.startsAt.toISOString()}_${cursor.id}`
}

/** El cursor de la URL, o `null` si no vale (un cursor inválido se ignora: primera página). */
export function parseBoardCursor(raw: string | undefined): RivalBoardCursor | null {
  if (!raw) return null
  const at = raw.indexOf('_')
  if (at < 0) return null
  const iso = raw.slice(0, at)
  const startsAt = new Date(iso)
  const id = uuid.safeParse(raw.slice(at + 1))
  if (!ISO_UTC.test(iso) || Number.isNaN(startsAt.getTime()) || !id.success) return null
  return { startsAt, id: id.data }
}
