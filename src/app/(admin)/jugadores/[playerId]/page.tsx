import { notFound, redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { isUuid } from '@/shared/validation/primitives'
import { checkPlayerBanned } from '@/modules/bans/ban.service'
import {
  getPlayerProfile,
  getPlayerStats,
  getPlayerBookingHistory,
  countPlayerBookingHistory,
  getPlayerFixedSlots,
  PLAYER_HISTORY_PAGE_SIZE,
} from '../queries'
import {
  banPlayerAction,
  liftPlayerBanAction,
  setPlayerTagsAction,
  unlinkContactAction,
} from '../actions'
import { JugadorProfileView } from './JugadorProfileView'

type Props = {
  params: Promise<{ playerId: string }>
  searchParams: Promise<{ historial?: string }>
}

/** `?historial=` es 1-based en la URL y 0-based adentro (igual que `?pagina=` de /jugadores). Basura → página 1. */
function parseHistoryPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n - 1 : 0
}

export default async function JugadorProfilePage(props: Props) {
  const params = await props.params
  const searchParams = await props.searchParams
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/dashboard')
  const { tenant } = auth

  // getPlayerProfile bindea playerId a SQL crudo (uuid): sin este guard,
  // /jugadores/abc revienta el cast en Postgres y cae al error boundary de
  // (admin) en vez de un 404 limpio. Mismo patrón que reservas/[id]/page.tsx.
  if (!isUuid(params.playerId)) notFound()

  const historyPage = parseHistoryPage(searchParams.historial)

  const data = await withTenantContext(tenant.id, async (tx) => {
    const profile = await getPlayerProfile(tenant.id, params.playerId, tx)
    if (!profile) return null
    const [stats, history, historyTotal, ban, fixedSlots] = await Promise.all([
      getPlayerStats(tenant.id, params.playerId, tx),
      getPlayerBookingHistory(
        tenant.id,
        params.playerId,
        tx,
        PLAYER_HISTORY_PAGE_SIZE,
        historyPage * PLAYER_HISTORY_PAGE_SIZE,
      ),
      countPlayerBookingHistory(tenant.id, params.playerId, tx),
      checkPlayerBanned(params.playerId, tenant.id, tx),
      getPlayerFixedSlots(tenant.id, params.playerId, tx),
    ])
    return { profile, stats, history, historyTotal, ban, fixedSlots }
  })

  if (!data) notFound()

  return (
    <JugadorProfileView
      {...data}
      historyPage={historyPage}
      banPlayerAction={banPlayerAction}
      liftPlayerBanAction={liftPlayerBanAction}
      setPlayerTagsAction={setPlayerTagsAction}
      unlinkContactAction={unlinkContactAction}
    />
  )
}
