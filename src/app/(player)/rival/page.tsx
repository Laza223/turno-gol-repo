import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { buildMetadata } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { listBoard, listBoardTenants, listEligibleTenants } from '@/modules/rival/rival.service'
import { listMyAlerts } from '@/modules/rival/rival-alerts.service'
import { uuid } from '@/shared/validation/primitives'
import { subscribeRivalAlertAction, unsubscribeMyRivalAlertAction } from './actions'
import { BoardView } from './BoardView'
import { encodeBoardCursor, parseBoardCursor } from './board-cursor'
import { sendRivalMagicLinkAction, startGoogleLoginFromRivalAction } from './p/[code]/login-actions'

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'RIVAL',
    description: 'Armá tu partido o sumate a uno en los complejos de TurnoGol.',
    path: '/rival',
    noIndex: true,
  })
}

// Sin loading.tsx en todo /rival: abriría un <Suspense> y el notFound() de abajo quedaría en
// 200 (soft-404). Ver "loading.tsx" en .claude/skills/convenciones-stack.

const PAGE_SIZE = 20

export default async function RivalPage(props: {
  searchParams: Promise<{ complejo?: string; despues?: string }>
}) {
  if (!(await isRivalEnabled())) notFound()
  const { complejo, despues } = await props.searchParams
  const tenantFilter = uuid.safeParse(complejo)
  const selectedTenantId = tenantFilter.success ? tenantFilter.data : null

  // Un cursor inválido se ignora: es la primera página.
  const [tenants, board] = await Promise.all([
    listBoardTenants(),
    listBoard({ tenantId: selectedTenantId, after: parseBoardCursor(despues), limit: PAGE_SIZE }),
  ])

  const next = new URLSearchParams()
  if (selectedTenantId) next.set('complejo', selectedTenantId)
  if (board.nextCursor) next.set('despues', encodeBoardCursor(board.nextCursor))

  // El aviso se ofrece en el tablón vacío y en el complejo filtrado sin partidos, pero la lista es barata y evita otro round-trip.
  const user = await extractAuthUser()
  const playerId = user?.type === 'player' ? user.playerId : null
  const [eligible, mine] = await Promise.all([
    listEligibleTenants(),
    playerId ? listMyAlerts(playerId) : Promise.resolve([]),
  ])

  return (
    <BoardView
      items={board.items}
      tenants={tenants}
      selectedTenantId={selectedTenantId}
      nextHref={board.nextCursor ? `/rival?${next.toString()}` : null}
      now={new Date()}
      alert={{
        alertTenants: eligible.map((t) => ({ id: t.id, name: t.name })),
        signedIn: playerId !== null,
        subscribed: mine.map((a) => ({ tenantId: a.tenantId, onlyGoalkeeper: a.onlyGoalkeeper })),
        subscribeAction: subscribeRivalAlertAction,
        unsubscribeAction: unsubscribeMyRivalAlertAction,
      }}
      entry={{
        sendMagicLink: sendRivalMagicLinkAction,
        startGoogle: startGoogleLoginFromRivalAction,
        inAppBrowser: isInAppBrowser((await headers()).get('user-agent')),
      }}
    />
  )
}
