import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { matchTypeLabel, weekdayOf } from '@/modules/rival/rival-display'
import { artDateOf } from '@/shared/time/art-date'
import type { RivalReportReason } from '@/modules/rival/rival.schema'
import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { CanceledCard, MatchHeader, RIVAL_ACTION } from '../../MatchBits'
import { DropIntentParam } from './DropIntentParam'
import { LeaveMatch } from './LeaveMatch'
import { canSeekRival } from './organizer-rules'
import { OrganizerActions } from './OrganizerActions'
import { myStatusLine, PeopleSection, type RowActionProps } from './People'
import { ReportMatchButton } from './ReportButton'
import { ShirtGrid } from './ShirtGrid'
import { VoyPanel, type VoyWelcome } from './VoyPanel'

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
  const canceled = match.status === 'canceled'
  const ended = !canceled && match.startsAt.getTime() <= now.getTime()
  const open = !canceled && !ended
  const me = roster.find((r) => r.isMe)
  const confirmed = roster.filter((r) => r.status === 'confirmed')
  const bench = roster.filter((r) => r.status === 'bench')
  const requested = roster.filter((r) => r.status === 'requested')
  // Quien se bajó vuelve por el link (spec §4); el organizador no "va" ni se baja: cancela.
  const canJoin = open && !match.isOrganizer && (!me || me.status === 'left')
  const canLeave =
    open &&
    !match.isOrganizer &&
    me !== undefined &&
    (me.status === 'confirmed' || me.status === 'bench' || me.status === 'requested')
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
  const full = match.confirmedCount >= match.capacity
  // Recién armado y del organizador: su acción sube sobre el plantel (el resto de las veces va al final).
  const lifted = justCreated && match.isOrganizer && open
  const primary =
    lifted && createdAs === 'rival' && match.seeking === null && canSeekRival(match, roster)
      ? 'publish'
      : 'share'
  const created =
    primary === 'publish'
      ? {
          title: 'Partido armado',
          line: 'Publicalo en el tablón para que un equipo rival te encuentre.',
        }
      : match.seeking === null
        ? {
            title: 'Partido armado',
            line: 'Pasale el link al grupo: cada uno confirma con un toque.',
          }
        : { title: 'Ya está en el tablón', line: 'Pasale el link al grupo.' }
  // Recién armado: arriba va el paso que sigue y "Cancelar el partido" queda abajo, después del plantel.
  const organizerActions = (part: 'all' | 'main' | 'cancel') =>
    open &&
    match.isOrganizer && (
      <OrganizerActions
        part={part}
        matchId={match.id}
        shareUrl={shareUrl}
        shareHref={shareHref}
        boardLabel={match.seeking === null ? null : matchTypeLabel(match)}
        whatsappPrefill={whatsappPrefill}
        canSeekRival={canSeekRival(match, roster)}
        primary={primary}
        cancelAction={cancelAction}
        publishAction={publishAction}
        unpublishAction={unpublishAction}
      />
    )

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-6">
      <DropIntentParam param={intentParam} />
      <div className="space-y-3">
        {lifted && (
          <div role="status" className="space-y-1">
            <p className="font-display text-3xl font-black italic leading-tight tracking-tight text-foreground">
              {created.title}
            </p>
            <p className="text-base text-muted-foreground">{created.line}</p>
          </div>
        )}
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
          <CanceledCard signedIn={signedIn} />
        ) : (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <ShirtGrid
              capacity={match.capacity}
              confirmed={match.confirmedCount}
              ended={ended}
              // Un equipo que busca rival todavía no sabe si se juega: el titular es "Busca rival".
              headline={match.seeking === 'rival' ? 'Busca rival' : undefined}
            />
            {/* El organizador no "va": su línea sería ruido en cada visita. */}
            {me && open && !match.isOrganizer && myStatusLine(me.status) && (
              <p className="mt-4 text-base text-foreground">{myStatusLine(me.status)}</p>
            )}
          </section>
        )}
      </div>

      {!canceled && (
        <>
          {lifted && organizerActions('main')}

          {/* "Voy" va pegado al cupo ("Faltan 3" → "Voy"), no detrás del plantel. */}
          {canJoin && full && (signedIn || voyGate) && (
            <p className="text-sm text-muted-foreground">
              El partido está completo. Si te sumás, quedás en el banco y entrás si alguien se baja.
            </p>
          )}
          {canJoin && signedIn && (
            <VoyPanel
              code={code}
              welcome={welcome}
              autoJoin={autoJoin}
              openWelcome={openWelcome}
              full={full}
              intentParam={intentParam}
              joinAction={joinAction}
              acceptAndJoinAction={acceptAndJoinAction}
            />
          )}
          {canJoin && !signedIn && (typeof voyGate === 'function' ? voyGate(full) : voyGate)}

          {signedIn && match.isOrganizer ? (
            <div className="space-y-6">
              <PeopleSection title="Pedidos" entries={requested} detail actions={rowActions} />
              <PeopleSection title="Quiénes van" entries={confirmed} detail actions={rowActions} />
              <PeopleSection title="El banco" entries={bench} detail actions={rowActions} />
            </div>
          ) : (
            signedIn && (
              <PeopleSection
                title="Quiénes van"
                entries={confirmed}
                detail={false}
                actions={rowActions}
              />
            )
          )}

          {organizerActions(lifted ? 'cancel' : 'all')}

          {canLeave && (
            <LeaveMatch
              matchId={match.id}
              leaveAction={leaveAction}
              requested={me?.status === 'requested'}
            />
          )}

          {ended && signedIn && match.isOrganizer && (
            <Link href={`/rival/nuevo?desde=${match.id}`} className={RIVAL_ACTION}>
              <Plus className="size-4" aria-hidden />
              Armar el del {repeatDay} que viene
            </Link>
          )}
          {ended && !match.isOrganizer && (
            <Link href="/rival" className={RIVAL_ACTION}>
              Ver el tablón
            </Link>
          )}

          {signedIn && !match.isOrganizer && (
            <ReportMatchButton matchId={match.id} reportAction={reportMatchAction} />
          )}
        </>
      )}
    </div>
  )
}
