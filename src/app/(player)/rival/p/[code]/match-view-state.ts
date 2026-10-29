import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import { canSeekRival } from './organizer-rules'

export type OrganizerPrimary = 'publish' | 'share'

/** Lo que dice el aviso de "recién armado" arriba del partido. */
function createdCopy(
  primary: OrganizerPrimary,
  seeking: RivalPublicMatch['seeking'],
): { title: string; line: string } {
  if (primary === 'publish') {
    return {
      title: 'Partido armado',
      line: 'Publicalo en el tablón para que un equipo rival te encuentre.',
    }
  }
  if (seeking === null) {
    return {
      title: 'Partido armado',
      line: 'Pasale el link al grupo: cada uno confirma con un toque.',
    }
  }
  return { title: 'Ya está en el tablón', line: 'Pasale el link al grupo.' }
}

function canLeaveMatch(
  open: boolean,
  isOrganizer: boolean,
  me: RivalRosterEntry | undefined,
): boolean {
  if (!open || isOrganizer || me === undefined) return false
  return me.status === 'confirmed' || me.status === 'bench' || me.status === 'requested'
}

/** Todo lo que `MatchView` deriva del partido, el plantel y la hora: sin JSX ni efectos. */
export function deriveMatchView({
  match,
  roster,
  now,
  justCreated,
  createdAs,
}: {
  match: RivalPublicMatch
  roster: RivalRosterEntry[]
  now: Date
  justCreated: boolean
  createdAs: 'full' | 'rival'
}) {
  const canceled = match.status === 'canceled'
  const ended = !canceled && match.startsAt.getTime() <= now.getTime()
  const open = !canceled && !ended
  const me = roster.find((r) => r.isMe)
  // Quien se bajó vuelve por el link (spec §4); el organizador no "va" ni se baja: cancela.
  const canJoin = open && !match.isOrganizer && (!me || me.status === 'left')
  const canLeave = canLeaveMatch(open, match.isOrganizer, me)
  // Recién armado y del organizador: su acción sube sobre el plantel (el resto de las veces va al final).
  const lifted = justCreated && match.isOrganizer && open
  const wantsPublish =
    lifted && createdAs === 'rival' && match.seeking === null && canSeekRival(match, roster)
  const primary: OrganizerPrimary = wantsPublish ? 'publish' : 'share'
  return {
    canceled,
    ended,
    open,
    me,
    confirmed: roster.filter((r) => r.status === 'confirmed'),
    bench: roster.filter((r) => r.status === 'bench'),
    requested: roster.filter((r) => r.status === 'requested'),
    canJoin,
    canLeave,
    full: match.confirmedCount >= match.capacity,
    lifted,
    primary,
    created: createdCopy(primary, match.seeking),
  }
}
