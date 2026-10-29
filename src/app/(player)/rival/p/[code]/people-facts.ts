import { RIVAL_POSITION_LABELS } from '@/modules/rival/rival-display'
import type { RivalRosterEntry } from '@/modules/rival/rival.types'

const MEMBER_SINCE = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Argentina/Buenos_Aires',
})

function gamesPlayedLabel(n: number): string {
  return `${n} ${n === 1 ? 'partido jugado' : 'partidos jugados'}`
}

/** La ficha de la spec §6 (solo con `detail`, y nunca en la propia fila). */
export function rowFacts(entry: RivalRosterEntry, detail: boolean): string[] {
  if (!detail || entry.isMe) return []
  return [
    entry.position ? RIVAL_POSITION_LABELS[entry.position] : null,
    entry.zone,
    entry.gamesPlayed !== null ? gamesPlayedLabel(entry.gamesPlayed) : null,
    entry.memberSince ? `En TurnoGol desde ${MEMBER_SINCE.format(entry.memberSince)}` : null,
  ].filter((f): f is string => f !== null)
}
