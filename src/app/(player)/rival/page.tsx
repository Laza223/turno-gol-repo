import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { listBoard } from '@/modules/rival/rival.service'
import { uuid } from '@/shared/validation/primitives'
import { BoardView } from './BoardView'

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

export default async function RivalPage(props: { searchParams: Promise<{ complejo?: string }> }) {
  if (!(await isRivalEnabled())) notFound()
  const { complejo } = await props.searchParams
  const tenantFilter = uuid.safeParse(complejo)
  const selectedTenantId = tenantFilter.success ? tenantFilter.data : null

  // El selector sale del tablón SIN filtrar (los complejos con publicaciones); con filtro,
  // una segunda lectura trae solo ese complejo.
  const all = await listBoard({ limit: 50 })
  const board = selectedTenantId ? await listBoard({ tenantId: selectedTenantId, limit: 50 }) : all

  const tenants = [...new Map(all.items.map((i) => [i.tenantId, i.tenantName])).entries()].map(
    ([id, name]) => ({ id, name }),
  )

  return (
    <BoardView
      items={board.items}
      tenants={tenants}
      selectedTenantId={selectedTenantId}
      now={new Date()}
    />
  )
}
