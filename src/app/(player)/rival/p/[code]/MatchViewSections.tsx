import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { matchTypeLabel } from '@/modules/rival/rival-display'
import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { CanceledCard } from '../../MatchBits'
import { RIVAL_ACTION } from '../../rival-classes'
import type { OrganizerPrimary } from './match-view-state'
import { canSeekRival } from './organizer-rules'
import { OrganizerActions } from './OrganizerActions'
import { myStatusLine, PeopleSection, type RowActionProps } from './People'
import { ShirtGrid } from './ShirtGrid'
import { VoyPanel, type VoyWelcome } from './VoyPanel'

/** El aviso de "recién armado" que sube sobre el partido. */
export function CreatedBanner({ title, line }: { title: string; line: string }) {
  return (
    <div role="status" className="space-y-1">
      <p className="font-display text-3xl font-black italic leading-tight tracking-tight text-foreground">
        {title}
      </p>
      <p className="text-base text-muted-foreground">{line}</p>
    </div>
  )
}

/** El cupo (camisetas) y mi estado; cancelado, la tarjeta de cancelado. */
export function StatusCard({
  match,
  canceled,
  ended,
  open,
  signedIn,
  me,
}: {
  match: RivalPublicMatch
  canceled: boolean
  ended: boolean
  open: boolean
  signedIn: boolean
  me: RivalRosterEntry | undefined
}) {
  if (canceled) return <CanceledCard signedIn={signedIn} />
  const myLine = me && open && !match.isOrganizer ? myStatusLine(me.status) : null
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <ShirtGrid
        capacity={match.capacity}
        confirmed={match.confirmedCount}
        ended={ended}
        // Un equipo que busca rival todavía no sabe si se juega: el titular es "Busca rival".
        headline={match.seeking === 'rival' ? 'Busca rival' : undefined}
      />
      {/* El organizador no "va": su línea sería ruido en cada visita. */}
      {myLine && <p className="mt-4 text-base text-foreground">{myLine}</p>}
    </section>
  )
}

/** Las acciones del organizador (compartir, publicar, cancelar); no render si no corresponde. */
export function OrganizerPart({
  part,
  open,
  match,
  roster,
  primary,
  shareUrl,
  shareHref,
  whatsappPrefill,
  cancelAction,
  publishAction,
  unpublishAction,
}: {
  part: 'all' | 'main' | 'cancel'
  open: boolean
  match: RivalPublicMatch
  roster: RivalRosterEntry[]
  primary: OrganizerPrimary
  shareUrl: string
  shareHref: string
  whatsappPrefill: string | null
  cancelAction: (matchId: string) => Promise<ActionResult>
  publishAction: (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
  unpublishAction: (matchId: string) => Promise<ActionResult>
}) {
  if (!open || !match.isOrganizer) return null
  return (
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
}

/** "Voy" pegado al cupo ("Faltan 3" → "Voy"), no detrás del plantel. */
export function JoinBlock({
  canJoin,
  signedIn,
  full,
  voyGate,
  code,
  welcome,
  autoJoin,
  openWelcome,
  intentParam,
  joinAction,
  acceptAndJoinAction,
}: {
  canJoin: boolean
  signedIn: boolean
  full: boolean
  voyGate?: ReactNode | ((full: boolean) => ReactNode)
  code: string
  welcome: VoyWelcome | null
  autoJoin: boolean
  openWelcome: boolean
  intentParam: string
  joinAction: (code: string) => Promise<RivalFormResult>
  acceptAndJoinAction: (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
}) {
  if (!canJoin) return null
  return (
    <>
      {full && (signedIn || voyGate) && (
        <p className="text-sm text-muted-foreground">
          El partido está completo. Si te sumás, quedás en el banco y entrás si alguien se baja.
        </p>
      )}
      {signedIn && (
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
      {!signedIn && (typeof voyGate === 'function' ? voyGate(full) : voyGate)}
    </>
  )
}

/** El plantel: el organizador ve pedidos y banco; el resto, solo quiénes van (y solo con sesión). */
export function PeopleBlock({
  signedIn,
  isOrganizer,
  requested,
  confirmed,
  bench,
  rowActions,
}: {
  signedIn: boolean
  isOrganizer: boolean
  requested: RivalRosterEntry[]
  confirmed: RivalRosterEntry[]
  bench: RivalRosterEntry[]
  rowActions: RowActionProps | undefined
}) {
  if (!signedIn) return null
  if (!isOrganizer) {
    return (
      <PeopleSection title="Quiénes van" entries={confirmed} detail={false} actions={rowActions} />
    )
  }
  return (
    <div className="space-y-6">
      <PeopleSection title="Pedidos" entries={requested} detail actions={rowActions} />
      <PeopleSection title="Quiénes van" entries={confirmed} detail actions={rowActions} />
      <PeopleSection title="El banco" entries={bench} detail actions={rowActions} />
    </div>
  )
}

/** Con el partido terminado: repetirlo (organizador) o volver al tablón (invitado). */
export function EndedLinks({
  ended,
  signedIn,
  isOrganizer,
  matchId,
  repeatDay,
}: {
  ended: boolean
  signedIn: boolean
  isOrganizer: boolean
  matchId: string
  repeatDay: string
}) {
  if (!ended) return null
  return (
    <>
      {signedIn && isOrganizer && (
        <Link href={`/rival/nuevo?desde=${matchId}`} className={RIVAL_ACTION}>
          <Plus className="size-4" aria-hidden />
          Armar el del {repeatDay} que viene
        </Link>
      )}
      {!isOrganizer && (
        <Link href="/rival" className={RIVAL_ACTION}>
          Ver el tablón
        </Link>
      )}
    </>
  )
}
