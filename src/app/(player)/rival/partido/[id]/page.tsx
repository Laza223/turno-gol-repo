import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
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
    const welcomeState = await getRivalWelcomeState(playerId)
    viewer = {
      kind: 'player',
      welcome:
        welcomeState && !welcomeState.welcomed
          ? {
              firstName: welcomeState.firstName,
              position: welcomeState.position,
              zone: welcomeState.zone,
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
    />
  )
}
