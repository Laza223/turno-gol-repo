import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { cn } from '@/lib/utils'
import { matchTypeLabel } from '@/modules/rival/rival-display'
import type { RivalReportReason } from '@/modules/rival/rival.schema'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { MatchHeader } from '../../MatchBits'
import { RIVAL_ACTION } from '../../rival-classes'
import { RivalEntryGate } from '../../RivalEntryGate'
import type { SendRivalMagicLink, StartGoogleLoginFromRival } from '../../p/[code]/login-actions'
import { ReportMatchButton } from '../../p/[code]/ReportButton'
import { ShirtGrid } from '../../p/[code]/ShirtGrid'
import { RequestPanel, type RequestWelcome } from './RequestPanel'

/** Quién mira: sin sesión (el verde abre el ingreso) o un jugador, con lo que le falta de la bienvenida. */
export type BoardViewer = { kind: 'anon' } | { kind: 'player'; welcome: RequestWelcome | null }

/**
 * La vista pública de un partido del tablón (`/rival/partido/[id]`), sin personas (spec §6): receipt
 * card, grilla y el tipo. Un solo verde: "Pedir sumarme" ("Pedir jugar con mi equipo" si el
 * partido busca rival: quien pide es el capitán de otro equipo). Sin sesión abre el ingreso RIVAL
 * (crea la cuenta) y vuelve a este partido sin pedir solo: el pedido sigue pidiendo el toque.
 */
export function PublicBoardView({
  match,
  viewer,
  now,
  requestAction,
  acceptAndRequestAction,
  reportMatchAction,
  sendMagicLink,
  startGoogle,
  inAppBrowser = false,
}: {
  match: RivalBoardItem
  viewer: BoardViewer
  now: Date
  requestAction: (matchId: string) => Promise<RivalFormResult>
  acceptAndRequestAction: (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
  reportMatchAction: (matchId: string, reason: RivalReportReason) => Promise<ActionResult>
  /** Las actions del ingreso entran por prop: `login-actions` es `'use server'` (ver `RivalEntryGate`). */
  sendMagicLink: SendRivalMagicLink
  startGoogle: StartGoogleLoginFromRival
  /** Lo resuelve la page con el User-Agent (ver `LoginGate`). */
  inAppBrowser?: boolean
}) {
  const type = matchTypeLabel(match)
  const seeksRival = match.seeking === 'rival'
  const label = seeksRival ? 'Pedir jugar con mi equipo' : 'Pedir sumarme'
  // "Faltan 3" ya es el titular de la grilla: el tipo aparte solo suma cuando dice otra cosa.
  const showType = seeksRival || match.seekingPosition === 'goalkeeper'
  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-6">
      <div className="space-y-3">
        <MatchHeader
          tenantName={match.tenantName}
          startsAt={match.startsAt}
          format={match.format}
          level={match.level}
          hasStamp={match.hasStamp}
          now={now}
        />

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
          {showType && (
            <p className="font-display text-2xl font-black italic leading-tight tracking-tight text-foreground">
              {type}
            </p>
          )}
          {/* Buscando rival el equipo completo no significa "Se juega": el titular es solo "Busca rival". */}
          <ShirtGrid
            capacity={match.capacity}
            confirmed={match.confirmedCount}
            headline={seeksRival ? null : undefined}
          />
        </section>
      </div>

      {viewer.kind === 'anon' ? (
        <FixedCta>
          <RivalEntryGate
            next={`/rival/partido/${match.id}`}
            label={label}
            purpose={seeksRival ? 'pedir_equipo' : 'pedir'}
            sendMagicLink={sendMagicLink}
            startGoogle={startGoogle}
            inAppBrowser={inAppBrowser}
            className={cn(RIVAL_ACTION, 'min-h-[52px]')}
          />
        </FixedCta>
      ) : (
        <>
          <RequestPanel
            matchId={match.id}
            label={label}
            seeksRival={seeksRival}
            welcome={viewer.welcome}
            requestAction={requestAction}
            acceptAndRequestAction={acceptAndRequestAction}
          />
          <ReportMatchButton matchId={match.id} reportAction={reportMatchAction} />
        </>
      )}
    </div>
  )
}
