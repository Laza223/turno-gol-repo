import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { listBoard, listBoardTenants } from '@/modules/rival/rival.service'
import { uuid } from '@/shared/validation/primitives'
import { BoardView } from './BoardView'
import { encodeBoardCursor, parseBoardCursor } from './board-cursor'

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

  return (
    <BoardView
      items={board.items}
      tenants={tenants}
      selectedTenantId={selectedTenantId}
      nextHref={board.nextCursor ? `/rival?${next.toString()}` : null}
      now={new Date()}
    />
  )
}
