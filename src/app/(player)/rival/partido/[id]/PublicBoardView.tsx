import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
import { matchTypeLabel } from '@/modules/rival/rival-display'
import type { RivalReportReason } from '@/modules/rival/rival.schema'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { MatchHeader } from '../../MatchBits'
import { ReportMatchButton } from '../../p/[code]/ReportButton'
import { ShirtGrid } from '../../p/[code]/ShirtGrid'
import type { VoyWelcome } from '../../p/[code]/VoyPanel'
import type { WelcomePhoto } from '../../WelcomeCard'
import { RequestPanel } from './RequestPanel'

/** Quién mira: sin sesión (el verde manda al login) o un jugador, con su bienvenida pendiente o no. */
export type BoardViewer = { kind: 'anon' } | { kind: 'player'; welcome: VoyWelcome | null }

/**
 * La vista pública de un partido del tablón (`/rival/partido/[id]`), sin personas (spec §6): receipt
 * card, grilla y el tipo. Un solo verde: "Pedir sumarme".
 */
export function PublicBoardView({
  match,
  viewer,
  now,
  requestAction,
  acceptAndRequestAction,
  reportMatchAction,
  photo,
}: {
  match: RivalBoardItem
  viewer: BoardViewer
  now: Date
  requestAction: (matchId: string) => Promise<ActionResult>
  acceptAndRequestAction: (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
  reportMatchAction: (matchId: string, reason: RivalReportReason) => Promise<ActionResult>
  /** Foto opcional de la bienvenida (la page la arma solo si hay storage). */
  photo?: WelcomePhoto
}) {
  const type = matchTypeLabel(match)
  const label = 'Pedir sumarme'
  // "Faltan 3" ya es el titular de la grilla: el tipo aparte solo suma cuando dice otra cosa.
  const showType = match.seeking === 'rival' || match.seekingPosition === 'goalkeeper'
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <MatchHeader
        tenantName={match.tenantName}
        startsAt={match.startsAt}
        format={match.format}
        level={match.level}
        hasStamp={match.hasStamp}
        now={now}
      />

      <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        {showType && (
          <p className="mb-4 font-display text-2xl font-black italic leading-tight tracking-tight text-foreground">
            {type}
          </p>
        )}
        <ShirtGrid capacity={match.capacity} confirmed={match.confirmedCount} />
      </section>

      {viewer.kind === 'anon' ? (
        <Link
          href={`/ingresar?next=${encodeURIComponent(`/rival/partido/${match.id}`)}`}
          className={cn(buttonVariants(), PORTAL_BUTTON, 'inline-flex items-center justify-center')}
        >
          {label}
        </Link>
      ) : (
        <>
          <RequestPanel
            matchId={match.id}
            label={label}
            welcome={viewer.welcome}
            requestAction={requestAction}
            acceptAndRequestAction={acceptAndRequestAction}
            photo={photo}
          />
          <ReportMatchButton matchId={match.id} reportAction={reportMatchAction} />
        </>
      )}
    </div>
  )
}
