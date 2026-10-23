import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { matchTypeLabel, weekdayOf } from '@/modules/rival/rival-display'
import { artDateOf } from '@/shared/time/art-date'
import type { RivalReportReason } from '@/modules/rival/rival.schema'
import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { CanceledCard, MatchHeader, RIVAL_CTA } from '../../MatchBits'
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
  /** Recién creado (`?creado=1`): muestra el aviso del organizador. */
  justCreated: boolean
  now: Date
  /** `wa.me/?text=…` de "Avisar al grupo", armado en el servidor. */
  shareHref: string
  /** Bienvenida RIVAL pendiente del jugador con sesión; `null` si ya la aceptó. */
  welcome: VoyWelcome | null
  /** Vuelta del login con intento válido y bienvenida aceptada: "Voy" se envía solo. */
  autoJoin: boolean
  /** Vuelta del login con intento válido y sin bienvenida: la tarjeta sale abierta. */
  openWelcome: boolean
  intentParam: string
  /** El "Voy" sin sesión (la variante RIVAL del login); lo arma la page. */
  voyGate?: ReactNode
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
  joinAction: (code: string) => Promise<ActionResult>
  acceptAndJoinAction: (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
  leaveAction: (matchId: string) => Promise<ActionResult>
}

/**
 * La vista del partido por link (`/rival/p/[code]`), según quién mira (spec §5.2, §5.3, §6):
 * sin sesión no hay personas; con sesión, nombre corto y foto de los confirmados; el organizador
 * ve además el banco, los pedidos y la ficha. Un solo verde por vista: "Voy" para el invitado,
 * "Avisar al grupo" para el organizador.
 */
export function MatchView({
  code,
  match,
  signedIn,
  roster,
  shareUrl,
  justCreated,
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

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <DropIntentParam param={intentParam} />
      {justCreated && match.isOrganizer && open && (
        <p
          role="status"
          className="flex items-center gap-2.5 rounded-2xl bg-muted/50 p-4 text-base font-medium text-foreground"
        >
          <Check aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          Listo. Ahora pasale el link al grupo.
        </p>
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
        <CanceledCard />
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <ShirtGrid capacity={match.capacity} confirmed={match.confirmedCount} ended={ended} />
            {/* El organizador no "va": su línea sería ruido en cada visita. */}
            {me && open && !match.isOrganizer && myStatusLine(me.status) && (
              <p className="mt-4 text-base text-foreground">{myStatusLine(me.status)}</p>
            )}
          </section>

          {signedIn && match.isOrganizer ? (
            <>
              <PeopleSection title="Pedidos" entries={requested} detail actions={rowActions} />
              <PeopleSection title="Confirmados" entries={confirmed} detail actions={rowActions} />
              <PeopleSection title="El banco" entries={bench} detail actions={rowActions} />
            </>
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

          {open && match.isOrganizer && (
            <OrganizerActions
              matchId={match.id}
              shareUrl={shareUrl}
              shareHref={shareHref}
              boardLabel={match.seeking === null ? null : matchTypeLabel(match)}
              whatsappPrefill={whatsappPrefill}
              canSeekRival={canSeekRival(match, roster)}
              cancelAction={cancelAction}
              publishAction={publishAction}
              unpublishAction={unpublishAction}
            />
          )}

          {canJoin && !signedIn && voyGate}
          {canJoin && signedIn && (
            <VoyPanel
              code={code}
              welcome={welcome}
              autoJoin={autoJoin}
              openWelcome={openWelcome}
              intentParam={intentParam}
              joinAction={joinAction}
              acceptAndJoinAction={acceptAndJoinAction}
            />
          )}
          {canLeave && (
            <LeaveMatch
              matchId={match.id}
              leaveAction={leaveAction}
              showHint={me?.status !== 'requested'}
            />
          )}

          {signedIn && !match.isOrganizer && (
            <ReportMatchButton matchId={match.id} reportAction={reportMatchAction} />
          )}

          {ended && signedIn && match.isOrganizer && (
            <Link href={`/rival/nuevo?desde=${match.id}`} className={RIVAL_CTA}>
              Armar el del {repeatDay} que viene
            </Link>
          )}
        </>
      )}
    </div>
  )
}
