import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalReportReason } from '@/modules/rival/rival.schema'
import { canAcceptRequest } from './organizer-rules'
import { rowFacts } from './people-facts'
import { ReportPlayerButton } from './ReportButton'
import { RemoveRowAction, RequestRowActions } from './RowActions'

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
    <img src={entry.avatarUrl} alt="" className="ri-avatar" />
  ) : (
    <span aria-hidden className="ri-avatar">
      {initialsOf(entry.shortName)}
    </span>
  )
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

/** Lo que el organizador decide en la fila; la denuncia va al lado, en el mismo contenedor. */
function RowActions({ entry, actions }: { entry: RivalRosterEntry; actions: RowActionProps }) {
  if (entry.isMe) return null
  const { organizer } = actions
  const decide = organizer && entry.status === 'requested'
  const remove = organizer && (entry.status === 'confirmed' || entry.status === 'bench')
  if (!decide && !remove) return null
  return (
    <>
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
    </>
  )
}

function PersonName({ entry }: { entry: RivalRosterEntry }) {
  return (
    <p className="break-words font-semibold text-portal-ink">
      {entry.role === 'rival_captain' ? 'Equipo rival: ' : ''}
      {entry.shortName}
      {entry.isMe && <span className="font-normal text-portal-soft"> (vos)</span>}
    </p>
  )
}

function ReportSlot({ entry, actions }: { entry: RivalRosterEntry; actions?: RowActionProps }) {
  if (!actions?.reportPlayerAction || entry.isMe) return null
  return (
    <ReportPlayerButton
      matchId={actions.matchId}
      playerId={entry.playerId}
      name={entry.shortName}
      reportAction={actions.reportPlayerAction}
    />
  )
}

/**
 * Una fila del plantel. Con `detail` (solo el organizador) suma la ficha de la spec §6, salvo en la
 * propia. El estado no se repite en la fila: lo dice el título de la sección.
 */
function PersonRow({
  entry,
  detail,
  actions,
}: {
  entry: RivalRosterEntry
  detail: boolean
  actions?: RowActionProps
}) {
  const facts = rowFacts(entry, detail)
  return (
    <li className="ri-req">
      <Avatar entry={entry} />
      <div className="min-w-0">
        <PersonName entry={entry} />
        {facts.length > 0 && <p className="rv-small tabular-nums">{facts.join(' · ')}</p>}
      </div>
      {actions && !entry.isMe && (
        <div className="pa-links ri-req__actions">
          <RowActions entry={entry} actions={actions} />
          <ReportSlot entry={entry} actions={actions} />
        </div>
      )}
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
    <section aria-label={title} className="rv-panel glass-painted rv-rise gap-1">
      <h2 className="rv-h2">{title}</h2>
      <ul>
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
      return 'Quedaste en el banco. Si alguien se baja, entrás vos: lo ves en Mis partidos.'
    case 'requested':
      return 'Pedido enviado. Te avisamos por mail si te aceptan.'
    case 'declined':
      return 'Esta vez no hubo lugar.'
    default:
      return null
  }
}
