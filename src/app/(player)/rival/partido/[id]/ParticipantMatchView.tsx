import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
import type { RivalReportReason } from '@/modules/rival/rival.schema'
import type { RivalMyMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import { CanceledCard, MatchHeader, RIVAL_CTA } from '../../MatchBits'
import { LeaveMatch } from '../../p/[code]/LeaveMatch'
import { myStatusLine, PeopleSection, type RowActionProps } from '../../p/[code]/People'
import { ReportMatchButton } from '../../p/[code]/ReportButton'
import { ShirtGrid } from '../../p/[code]/ShirtGrid'

/** La línea de estado del participante, según su `myStatus` (spec §5.7, §6). */
function statusLine(m: RivalMyMatch): string | null {
  switch (m.myStatus) {
    case 'confirmed':
      return m.myRole === 'rival_captain'
        ? 'Son el equipo rival. Listo, quedó confirmado.'
        : myStatusLine('confirmed')
    case 'left':
      return 'Te bajaste de este partido.'
    case 'removed':
      return 'Ya no estás en este partido.'
    default:
      return m.myStatus ? myStatusLine(m.myStatus) : null
  }
}

/**
 * La vista de quien participa de un partido sin organizarlo (`/rival/partido/[id]`): pidió sumarse,
 * lo aceptaron, está en el banco, se bajó o lo sacaron. El único verde posible es "Escribile por
 * WhatsApp" (aceptado desde el tablón); sin él, la salida es "Ver el tablón".
 */
export function ParticipantMatchView({
  match,
  roster,
  contactLink,
  now,
  leaveAction,
  reportMatchAction,
  reportPlayerAction,
}: {
  match: RivalMyMatch
  roster: RivalRosterEntry[]
  /** `wa.me` al organizador; solo para el aceptado desde el tablón (lo arma el servidor). */
  contactLink: string | null
  now: Date
  leaveAction: (matchId: string) => Promise<ActionResult>
  reportMatchAction: (matchId: string, reason: RivalReportReason) => Promise<ActionResult>
  reportPlayerAction: (
    matchId: string,
    reportedPlayerId: string,
    reason: RivalReportReason,
  ) => Promise<ActionResult>
}) {
  const canceled = match.status === 'canceled'
  const ended = !canceled && match.startsAt.getTime() <= now.getTime()
  const open = !canceled && !ended
  const status = match.myStatus
  const inside = status === 'confirmed' || status === 'bench'
  const canLeave = open && (inside || status === 'requested')
  const showContact = open && status === 'confirmed' && match.myOrigin === 'board' && contactLink
  const out = status === 'declined' || status === 'left' || status === 'removed'
  const line = statusLine(match)
  const rowActions: RowActionProps = { matchId: match.id, match, roster, reportPlayerAction }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <MatchHeader
        tenantName={match.tenantName}
        startsAt={match.startsAt}
        format={match.format}
        level={match.level}
        hasStamp={match.hasStamp}
        ended={ended}
        now={now}
      />

      {canceled ? (
        <CanceledCard />
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <ShirtGrid capacity={match.capacity} confirmed={match.confirmedCount} ended={ended} />
            {open && line && <p className="mt-4 text-base text-foreground">{line}</p>}
          </section>

          {inside && (
            <PeopleSection
              title="Quiénes van"
              entries={roster.filter((r) => r.status === 'confirmed')}
              detail={false}
              actions={rowActions}
            />
          )}

          {showContact && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Al escribirle, va a ver tu número.</p>
              <a
                href={contactLink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants(),
                  PORTAL_BUTTON,
                  'inline-flex items-center justify-center',
                )}
              >
                Escribile por WhatsApp
              </a>
            </div>
          )}

          {canLeave && (
            <LeaveMatch matchId={match.id} leaveAction={leaveAction} showHint={inside} />
          )}

          {(out || ended) && (
            <Link href="/rival" className={cn(RIVAL_CTA, 'w-full')}>
              Ver el tablón
            </Link>
          )}
        </>
      )}

      <ReportMatchButton matchId={match.id} reportAction={reportMatchAction} />
    </div>
  )
}
