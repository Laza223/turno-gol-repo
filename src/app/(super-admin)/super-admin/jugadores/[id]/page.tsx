import { notFound } from 'next/navigation'
import { UserRound } from 'lucide-react'
import { BackLink } from '@/components/admin/BackLink'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import { getPlayerDetail } from '@/modules/super-admin/players.service'
import { PlayerStatusBadge } from '../../_components/player-status-visual'
import { PlayerBookingsTable } from './_components/player-bookings-table'
import { PlayerDataCard } from './_components/player-data-card'
import { PlayerTenantsCard } from './_components/player-tenants-card'

export const dynamic = 'force-dynamic'

/** Reloj de la request, fuera del componente: es un dato, no parte del render. */
function nowMs(): number {
  return Date.now()
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PAGE_SIZE = 20

function parsePage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 1
}

export default async function SuperAdminPlayerDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pagina?: string }>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  await requireSystemAdmin()

  if (!UUID_RE.test(params.id)) notFound()
  // La URL va en 1-based; el servicio y el Pager, en 0-based.
  const detail = await getPlayerDetail(params.id, {
    page: parsePage(searchParams.pagina) - 1,
    pageSize: PAGE_SIZE,
  })
  if (!detail) notFound()

  const hrefFor = (p: number) =>
    p > 0
      ? `/super-admin/jugadores/${params.id}?pagina=${p + 1}`
      : `/super-admin/jugadores/${params.id}`

  return (
    <div className="space-y-3 lg:space-y-6">
      <PageHeader
        back={<BackLink href="/super-admin/jugadores">Jugadores</BackLink>}
        title={detail.player.name}
        icon={
          <UserRound
            className="h-6 w-6 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
        }
        actions={<PlayerStatusBadge status={detail.player.status} />}
      />
      <div className="grid gap-3 lg:gap-6 lg:grid-cols-2">
        <PlayerDataCard player={detail.player} now={nowMs()} />
        <PlayerTenantsCard tenants={detail.tenants} />
      </div>
      <PlayerBookingsTable
        rows={detail.bookings}
        page={detail.bookingsPage}
        total={detail.bookingsTotal}
        pageSize={detail.bookingsPageSize}
        hrefFor={hrefFor}
      />
    </div>
  )
}
