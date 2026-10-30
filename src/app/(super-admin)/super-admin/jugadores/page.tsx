import { Users } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import { getPlayerStats, isPlayerFilter, listPlayers } from '@/modules/super-admin/players.service'
import { PlayersFilters } from './_components/players-filters'
import { PlayersStats } from './_components/players-stats'
import { PlayersTable } from './_components/players-table'

export const dynamic = 'force-dynamic'

/** Reloj de la request, fuera del componente: es un dato, no parte del render. */
function nowMs(): number {
  return Date.now()
}

const PAGE_SIZE = 25

type SearchParams = { q?: string; filtro?: string; pagina?: string }

function parsePage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 1
}

export default async function SuperAdminPlayersPage(props: {
  searchParams: Promise<SearchParams>
}) {
  const searchParams = await props.searchParams
  await requireSystemAdmin()

  const q = searchParams.q?.trim() || undefined
  const filter = isPlayerFilter(searchParams.filtro) ? searchParams.filtro : 'todos'
  // La URL va en 1-based (como Complejos); el servicio y el Pager, en 0-based.
  const page = parsePage(searchParams.pagina) - 1

  const [stats, list] = await Promise.all([
    getPlayerStats(),
    listPlayers({ q, filter, page, pageSize: PAGE_SIZE }),
  ])

  const hrefFor = (p: number) => {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (filter !== 'todos') sp.set('filtro', filter)
    if (p > 0) sp.set('pagina', String(p + 1))
    const qs = sp.toString()
    return `/super-admin/jugadores${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-3 lg:space-y-6">
      <PageHeader
        title="Jugadores"
        subtitle={`${stats.total} ${stats.total === 1 ? 'jugador' : 'jugadores'} en la plataforma`}
        icon={
          <Users className="h-6 w-6 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
        }
      />
      <PlayersStats stats={stats} />
      <PlayersFilters q={q} filter={filter} />
      <PlayersTable
        rows={list.rows}
        page={list.page}
        total={list.total}
        pageSize={list.pageSize}
        hrefFor={hrefFor}
        filtered={Boolean(q) || filter !== 'todos'}
        now={nowMs()}
      />
    </div>
  )
}
