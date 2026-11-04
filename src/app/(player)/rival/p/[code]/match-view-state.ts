import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'

/** Lo que dice el aviso de "recién armado" arriba del partido. */
function createdCopy(seeking: RivalPublicMatch['seeking']): { title: string; line: string } {
  if (seeking === 'players') {
    return {
      title: 'Ya está en el tablón',
      line: 'Pasale el link al grupo: los que vengan con vos confirman con un toque.',
    }
  }
  if (seeking === 'rival') {
    return {
      title: 'Ya está en el tablón',
      line: 'Mientras tanto, pasale el link a tu equipo.',
    }
  }
  return {
    title: 'Partido armado',
    line: 'Pasale el link al grupo: cada uno confirma con un toque.',
  }
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
}: {
  match: RivalPublicMatch
  roster: RivalRosterEntry[]
  now: Date
  justCreated: boolean
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
    created: createdCopy(match.seeking),
  }
}
