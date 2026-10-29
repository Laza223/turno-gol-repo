import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { welcomeNeeds } from '@/modules/rival/rival-join-rule'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import {
  getBoardMatch,
  getContactLink,
  getMyMatch,
  getRivalWelcomeState,
  getRoster,
} from '@/modules/rival/rival.service'
import { uuid } from '@/shared/validation/primitives'
import {
  acceptWelcomeAndRequestAction,
  leaveMatchAction,
  reportMatchAction,
  reportPlayerAction,
  requestToJoinAction,
} from '../../actions'
import {
  sendRivalMagicLinkAction,
  startGoogleLoginFromRivalAction,
} from '../../p/[code]/login-actions'
import { ParticipantMatchView } from './ParticipantMatchView'
import { PublicBoardView, type BoardViewer } from './PublicBoardView'

// El partido es de quien lo encuentra en el tablón o lo pidió: noindex.
export const metadata: Metadata = {
  title: 'Partido · RIVAL',
  robots: { index: false, follow: false },
}

// Sin loading.tsx en /rival: abriría un <Suspense> y el notFound() quedaría en 200 (soft-404).
export default async function RivalBoardMatchPage(props: { params: Promise<{ id: string }> }) {
  if (!(await isRivalEnabled())) notFound()
  const parsed = uuid.safeParse((await props.params).id)
  if (!parsed.success) notFound()
  const matchId = parsed.data

  const user = await extractAuthUser()
  const playerId = user && user.type === 'player' ? user.playerId : null
  const now = new Date()

  if (playerId) {
    const mine = await getMyMatch(playerId, matchId)
    if (mine?.isOrganizer && mine.inviteCode) redirect(`/rival/p/${mine.inviteCode}`)
    if (mine?.myStatus) {
      const roster = await getRoster(playerId, mine.id)
      const contactLink =
        mine.myStatus === 'confirmed' && mine.myOrigin === 'board'
          ? await getContactLink(playerId, mine.id)
          : null
      return (
        <ParticipantMatchView
          match={mine}
          roster={roster}
          contactLink={contactLink}
          now={now}
          leaveAction={leaveMatchAction}
          reportMatchAction={reportMatchAction}
          reportPlayerAction={reportPlayerAction}
        />
      )
    }
  }

  const match = await getBoardMatch(matchId)
  if (!match) notFound()

  let viewer: BoardViewer = { kind: 'anon' }
  if (playerId) {
    // Solo se pide lo que falta: nombre y reglas, posición y zona, o las dos cosas.
    const welcomeState = await getRivalWelcomeState(playerId)
    const needs = welcomeState
      ? welcomeNeeds(welcomeState, match.seeking === 'rival' ? 'desafiar' : 'sumarse')
      : null
    viewer = {
      kind: 'player',
      welcome:
        welcomeState && needs
          ? {
              firstName: welcomeState.firstName,
              position: welcomeState.position,
              zone: welcomeState.zone,
              needs,
            }
          : null,
    }
  }

  return (
    <PublicBoardView
      match={match}
      viewer={viewer}
      now={now}
      requestAction={requestToJoinAction}
      acceptAndRequestAction={acceptWelcomeAndRequestAction}
      reportMatchAction={reportMatchAction}
      sendMagicLink={sendRivalMagicLinkAction}
      startGoogle={startGoogleLoginFromRivalAction}
      inAppBrowser={playerId === null && isInAppBrowser((await headers()).get('user-agent'))}
    />
  )
}
