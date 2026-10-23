import { cn } from '@/lib/utils'
import { TONE_BADGE, type StatusTone } from '@/lib/status-tone'
import { RIVAL_POSITION_LABELS } from '@/modules/rival/rival-display'
import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalReportReason } from '@/modules/rival/rival.schema'
import { canAcceptRequest } from './organizer-rules'
import { ReportPlayerButton } from './ReportButton'
import { RemoveRowAction, RequestRowActions } from './RowActions'

const MEMBER_SINCE = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Argentina/Buenos_Aires',
})

function initialsOf(shortName: string): string {
  return shortName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function Avatar({ entry }: { entry: RivalRosterEntry }) {
  return entry.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={entry.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
  ) : (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-display text-sm font-black italic text-foreground"
    >
      {initialsOf(entry.shortName)}
    </span>
  )
}

const STATUS_BADGE: Partial<
  Record<RivalRosterEntry['status'], { label: string; tone: StatusTone }>
> = {
  confirmed: { label: 'Confirmado', tone: 'success' },
  bench: { label: 'En el banco', tone: 'neutral' },
  requested: { label: 'Pidió sumarse', tone: 'neutral' },
}

/** Las acciones de las filas: lo que el organizador decide y la denuncia de quien tiene sesión. */
export type RowActionProps = {
  matchId: string
  match: Pick<RivalPublicMatch, 'capacity' | 'confirmedCount'>
  /** Todo el plantel (para saber si ya hay un capitán rival confirmado). */
  roster: RivalRosterEntry[]
  /** Solo el organizador: aceptar, rechazar y sacar. */
  organizer?: {
    decideAction: (participantId: string, d: 'accept' | 'decline') => Promise<ActionResult>
    removeAction: (participantId: string) => Promise<ActionResult>
  }
  /** Quien tiene sesión puede denunciar a otra persona. */
  reportPlayerAction?: (
    matchId: string,
    reportedPlayerId: string,
    reason: RivalReportReason,
  ) => Promise<ActionResult>
}

function RowActions({ entry, actions }: { entry: RivalRosterEntry; actions: RowActionProps }) {
  if (entry.isMe) return null
  const { organizer, reportPlayerAction } = actions
  const decide = organizer && entry.status === 'requested'
  const remove = organizer && (entry.status === 'confirmed' || entry.status === 'bench')
  if (!decide && !remove && !reportPlayerAction) return null
  return (
    <div className="flex flex-wrap items-center gap-x-1 pb-1 pl-[52px]">
      {decide && (
        <RequestRowActions
          participantId={entry.participantId}
          canAccept={canAcceptRequest(entry, actions.match, actions.roster)}
          decideAction={organizer.decideAction}
        />
      )}
      {remove && (
        <RemoveRowAction
          participantId={entry.participantId}
          name={entry.shortName}
          removeAction={organizer.removeAction}
        />
      )}
      {reportPlayerAction && (
        <ReportPlayerButton
          matchId={actions.matchId}
          playerId={entry.playerId}
          reportAction={reportPlayerAction}
        />
      )}
    </div>
  )
}

/** Una fila del plantel. Con `detail` (solo el organizador) suma la ficha de la spec §6. */
function PersonRow({
  entry,
  detail,
  actions,
}: {
  entry: RivalRosterEntry
  detail: boolean
  actions?: RowActionProps
}) {
  const badge = detail ? STATUS_BADGE[entry.status] : undefined
  const facts = detail
    ? [
        entry.position ? RIVAL_POSITION_LABELS[entry.position] : null,
        entry.zone,
        entry.gamesPlayed !== null
          ? `${entry.gamesPlayed} ${entry.gamesPlayed === 1 ? 'partido jugado' : 'partidos jugados'}`
          : null,
        entry.memberSince ? `En TurnoGol desde ${MEMBER_SINCE.format(entry.memberSince)}` : null,
      ].filter((f): f is string => f !== null)
    : []
  return (
    <li className="py-2">
      <div className="flex items-start gap-3">
        <Avatar entry={entry} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-base font-medium text-foreground">
            {entry.role === 'rival_captain' ? 'Equipo rival: ' : ''}
            {entry.shortName}
            {entry.isMe && <span className="font-normal text-muted-foreground"> (vos)</span>}
          </p>
          {facts.length > 0 && <p className="text-sm text-muted-foreground">{facts.join(' · ')}</p>}
        </div>
        {badge && (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium',
              TONE_BADGE[badge.tone],
            )}
          >
            {badge.label}
          </span>
        )}
      </div>
      {actions && <RowActions entry={entry} actions={actions} />}
    </li>
  )
}

export function PeopleSection({
  title,
  entries,
  detail,
  actions,
}: {
  title: string
  entries: RivalRosterEntry[]
  detail: boolean
  actions?: RowActionProps
}) {
  if (entries.length === 0) return null
  return (
    <section aria-label={title} className="space-y-1">
      <h2 className="font-display text-lg font-extrabold tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <PersonRow key={e.participantId} entry={e} detail={detail} actions={actions} />
        ))}
      </ul>
    </section>
  )
}

/** Mi estado cuando juego o pedí sumarme (el resultado de "Voy", en palabras de la spec §5.2). */
export function myStatusLine(status: RivalRosterEntry['status']): string | null {
  switch (status) {
    case 'confirmed':
      return 'Listo, estás adentro. Nos vemos en la cancha.'
    case 'bench':
      return 'Quedaste en el banco. Si alguien se baja, entrás vos y te avisamos por mail.'
    case 'requested':
      return 'Pedido enviado. Te avisamos por mail si te aceptan.'
    case 'declined':
      return 'Esta vez no hubo lugar.'
    default:
      return null
  }
}
