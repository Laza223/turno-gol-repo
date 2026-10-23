import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { absoluteUrl } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import {
  getBoardPublishPrefill,
  getPublicMatch,
  getRivalWelcomeState,
  getRoster,
} from '@/modules/rival/rival.service'
import { shouldAutoJoin } from '@/modules/rival/rival-join-rule'
import { buildShareHref } from '@/modules/rival/rival-share'
import { RIVAL_INTENT_PARAM } from '@/shared/security/rival-intent'
import {
  acceptWelcomeAndJoinAction,
  cancelMatchAction,
  decideRequestAction,
  joinMatchAction,
  leaveMatchAction,
  publishToBoardAction,
  removeParticipantAction,
  reportMatchAction,
  reportPlayerAction,
  unpublishFromBoardAction,
} from '../../actions'
import { MatchView } from './MatchView'
import { sendRivalMagicLinkAction, startGoogleLoginFromRivalAction } from './login-actions'
import { readRivalIntent } from './rival-intent.server'
import { RivalVoyGate } from './RivalVoyGate'

// Sin `openGraph` a propósito: la imagen de vista previa la pone `opengraph-image.tsx` de esta
// carpeta (con complejo, día y hora, sin contador). El link es privado del grupo: noindex.
export const metadata: Metadata = {
  title: 'Partido · RIVAL',
  robots: { index: false, follow: false },
}

function nowDate(): Date {
  return new Date()
}

// Sin loading.tsx en /rival: abriría un <Suspense> y el notFound() quedaría en 200 (soft-404).
export default async function RivalMatchPage(props: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ creado?: string; rival_intent?: string }>
}) {
  if (!(await isRivalEnabled())) notFound()
  const [{ code }, { creado, rival_intent: linkToken }, user] = await Promise.all([
    props.params,
    props.searchParams,
    extractAuthUser(),
  ])
  const playerId = user && user.type === 'player' ? user.playerId : null

  // Oculto o inexistente: 404 real (la base ya lo filtra, salvo para el organizador).
  const match = await getPublicMatch(code, playerId)
  if (!match) notFound()

  // Sin sesión no hay personas: ni se consulta el plantel.
  const roster = playerId ? await getRoster(playerId, match.id, code) : []

  // Bienvenida pendiente: "Voy" abre la tarjeta ("Estoy adentro"). Aceptada: "Voy" suma directo.
  const welcomeState = playerId ? await getRivalWelcomeState(playerId) : null
  const welcome =
    welcomeState && !welcomeState.welcomed
      ? {
          firstName: welcomeState.firstName,
          position: welcomeState.position,
          zone: welcomeState.zone,
        }
      : null

  // Vuelta del login con "Voy" firmado: aceptada la bienvenida se suma sola; sin ella, la tarjeta
  // sale abierta y el consentimiento pide el toque. Un intento que no vale es una visita normal.
  const intent =
    user && user.type === 'player'
      ? await readRivalIntent(code, { email: user.email }, linkToken)
      : null
  const intentOk = intent?.ok === true

  // El WhatsApp precargado del form de publicar: solo lo usa el organizador.
  const prefill = playerId && match.isOrganizer ? await getBoardPublishPrefill(playerId) : null

  const shareUrl = absoluteUrl(`/rival/p/${code}`)
  return (
    <MatchView
      code={code}
      match={match}
      signedIn={playerId !== null}
      roster={roster}
      shareUrl={shareUrl}
      shareHref={buildShareHref(match, shareUrl)}
      welcome={welcome}
      autoJoin={shouldAutoJoin({
        intentOk,
        welcomeDone: welcome === null,
        myStatus: roster.find((r) => r.isMe)?.status ?? null,
      })}
      openWelcome={intentOk && welcome !== null}
      intentParam={RIVAL_INTENT_PARAM}
      voyGate={
        playerId === null ? (
          <RivalVoyGate
            code={code}
            sendMagicLink={sendRivalMagicLinkAction}
            startGoogle={startGoogleLoginFromRivalAction}
            inAppBrowser={isInAppBrowser((await headers()).get('user-agent'))}
          />
        ) : undefined
      }
      justCreated={creado === '1'}
      now={nowDate()}
      whatsappPrefill={prefill?.whatsapp ?? null}
      cancelAction={cancelMatchAction}
      publishAction={publishToBoardAction}
      unpublishAction={unpublishFromBoardAction}
      decideAction={decideRequestAction}
      removeAction={removeParticipantAction}
      reportMatchAction={reportMatchAction}
      reportPlayerAction={reportPlayerAction}
      joinAction={joinMatchAction}
      acceptAndJoinAction={acceptWelcomeAndJoinAction}
      leaveAction={leaveMatchAction}
    />
  )
}
