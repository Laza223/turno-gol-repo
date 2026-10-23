import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'

/**
 * ¿Se muestra "Aceptar" en un pedido? El capitán rival no cuenta para el cupo: solo cabe uno
 * confirmado. Un jugador solo entra si el partido no está lleno.
 */
export function canAcceptRequest(
  entry: Pick<RivalRosterEntry, 'role'>,
  match: Pick<RivalPublicMatch, 'capacity' | 'confirmedCount'>,
  roster: Pick<RivalRosterEntry, 'role' | 'status'>[],
): boolean {
  if (entry.role === 'rival_captain') {
    return !roster.some((r) => r.role === 'rival_captain' && r.status === 'confirmed')
  }
  return match.confirmedCount < match.capacity
}

/**
 * ¿Se ofrece "Buscamos rival" al publicar después? En "Busca rival" el cupo es el formato (§3),
 * y con un capitán rival ya confirmado no se busca otro (el trigger lo rechazaría).
 */
export function canSeekRival(
  match: Pick<RivalPublicMatch, 'capacity' | 'format'>,
  roster: Pick<RivalRosterEntry, 'role' | 'status'>[],
): boolean {
  return (
    match.capacity === match.format &&
    !roster.some((r) => r.role === 'rival_captain' && r.status === 'confirmed')
  )
}
