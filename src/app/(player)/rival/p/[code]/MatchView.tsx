import type { ReactNode } from 'react'
import { weekdayOf } from '@/modules/rival/rival-display'
import { artDateOf } from '@/shared/time/art-date'
import type { RivalReportReason } from '@/modules/rival/rival.schema'
import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { MatchHeader } from '../../MatchBits'
import { DropIntentParam } from './DropIntentParam'
import { LeaveMatch } from './LeaveMatch'
import { deriveMatchView } from './match-view-state'
import {
  CreatedBanner,
  EndedLinks,
  JoinBlock,
  OrganizerPart,
  PeopleBlock,
  StatusCard,
} from './MatchViewSections'
import type { RowActionProps } from './People'
import { ReportMatchButton } from './ReportButton'
import type { VoyWelcome } from './VoyPanel'

type Props = {
  /** Código del link (`/rival/p/[code]`): "Voy" suma por él. */
  code: string
  match: RivalPublicMatch
  /** `true` si hay un jugador con sesión mirando. */
  signedIn: boolean
  /** Lo que `getRoster` deja ver a este jugador (vacío sin sesión). */
  roster: RivalRosterEntry[]
  shareUrl: string
  /** Recién creado (`?creado=`): el aviso del organizador y su acción verde arriba, antes del plantel. */
  justCreated: boolean
  /** Qué armó: `rival` ("Mi equipo busca rival") hace de "Publicar en el tablón" el paso que sigue. */
  createdAs?: 'full' | 'rival'
  now: Date
  /** `wa.me/?text=…` de "Avisar al grupo", armado en el servidor. */
  shareHref: string
  /** Lo que le falta a la bienvenida del jugador con sesión; `null` si no le falta nada. */
  welcome: VoyWelcome | null
  /** Vuelta del login con intento válido y nada pendiente: "Voy" se envía solo. */
  autoJoin: boolean
  /** Vuelta del login con intento válido y algo pendiente: la tarjeta sale abierta. */
  openWelcome: boolean
  intentParam: string
  /** El "Voy" sin sesión (la variante RIVAL del login); lo arma la page. Con función recibe si el partido está lleno. */
  voyGate?: ReactNode | ((full: boolean) => ReactNode)
  /** Prefill del WhatsApp del form de publicar (de `players.phone`). */
  whatsappPrefill: string | null
  cancelAction: (matchId: string) => Promise<ActionResult>
  publishAction: (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
  unpublishAction: (matchId: string) => Promise<ActionResult>
  decideAction: (participantId: string, decision: 'accept' | 'decline') => Promise<ActionResult>
  removeAction: (participantId: string) => Promise<ActionResult>
  reportMatchAction: (matchId: string, reason: RivalReportReason) => Promise<ActionResult>
  reportPlayerAction: (
    matchId: string,
    reportedPlayerId: string,
    reason: RivalReportReason,
  ) => Promise<ActionResult>
  joinAction: (code: string) => Promise<RivalFormResult>
  acceptAndJoinAction: (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
  leaveAction: (matchId: string) => Promise<ActionResult>
}

/**
 * La vista del partido por link (`/rival/p/[code]`), según quién mira (spec §5.2, §5.3, §6):
 * sin sesión no hay personas; con sesión, nombre corto y foto de los confirmados; el organizador
 * ve además el banco, los pedidos y la ficha. Un solo verde por vista, y es el paso que sigue: "Voy"
 * para el invitado, "Avisar al grupo" (o "Publicar en el tablón" si su equipo busca rival) para el
 * organizador, que recién armado lo ve antes que el plantel.
 */
export function MatchView({
  code,
  match,
  signedIn,
  roster,
  shareUrl,
  justCreated,
  createdAs = 'full',
  now,
  shareHref,
  welcome,
  autoJoin,
  openWelcome,
  intentParam,
  voyGate,
  cancelAction,
  joinAction,
  acceptAndJoinAction,
  leaveAction,
  whatsappPrefill,
  publishAction,
  unpublishAction,
  decideAction,
  removeAction,
  reportMatchAction,
  reportPlayerAction,
}: Props) {
  const {
    canceled,
    ended,
    open,
    me,
    confirmed,
    bench,
    requested,
    canJoin,
    canLeave,
    full,
    lifted,
    primary,
    created,
  } = deriveMatchView({ match, roster, now, justCreated, createdAs })
  // Cada fila ofrece lo suyo: el organizador decide y saca; cualquiera con sesión denuncia.
  const rowActions: RowActionProps | undefined = signedIn
    ? {
        matchId: match.id,
        match,
        roster,
        reportPlayerAction,
        ...(match.isOrganizer && open ? { organizer: { decideAction, removeAction } } : {}),
      }
    : undefined
  const repeatDay = weekdayOf(artDateOf(match.startsAt))
  // Recién armado: arriba va el paso que sigue y "Cancelar el partido" queda abajo, después del plantel.
  const organizerPart = (part: 'all' | 'main' | 'cancel') => (
    <OrganizerPart
      part={part}
      open={open}
      match={match}
      roster={roster}
      primary={primary}
      shareUrl={shareUrl}
      shareHref={shareHref}
      whatsappPrefill={whatsappPrefill}
      cancelAction={cancelAction}
      publishAction={publishAction}
      unpublishAction={unpublishAction}
    />
  )

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-6">
      <DropIntentParam param={intentParam} />
      <div className="space-y-3">
        {lifted && <CreatedBanner title={created.title} line={created.line} />}
        <MatchHeader
          tenantName={match.tenantName}
          startsAt={match.startsAt}
          format={match.format}
          level={match.level}
          hasStamp={match.hasStamp}
          ended={ended}
          now={now}
        />
        <StatusCard
          match={match}
          canceled={canceled}
          ended={ended}
          open={open}
          signedIn={signedIn}
          me={me}
        />
      </div>

      {!canceled && (
        <>
          {lifted && organizerPart('main')}
          <JoinBlock
            canJoin={canJoin}
            signedIn={signedIn}
            full={full}
            voyGate={voyGate}
            code={code}
            welcome={welcome}
            autoJoin={autoJoin}
            openWelcome={openWelcome}
            intentParam={intentParam}
            joinAction={joinAction}
            acceptAndJoinAction={acceptAndJoinAction}
          />
          <PeopleBlock
            signedIn={signedIn}
            isOrganizer={match.isOrganizer}
            requested={requested}
            confirmed={confirmed}
            bench={bench}
            rowActions={rowActions}
          />

          {organizerPart(lifted ? 'cancel' : 'all')}

          {canLeave && (
            <LeaveMatch
              matchId={match.id}
              leaveAction={leaveAction}
              requested={me?.status === 'requested'}
            />
          )}

          <EndedLinks
            ended={ended}
            signedIn={signedIn}
            isOrganizer={match.isOrganizer}
            matchId={match.id}
            repeatDay={repeatDay}
          />

          {signedIn && !match.isOrganizer && (
            <ReportMatchButton matchId={match.id} reportAction={reportMatchAction} />
          )}
        </>
      )}
    </div>
  )
}
