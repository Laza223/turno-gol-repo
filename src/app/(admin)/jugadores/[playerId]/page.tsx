import { notFound, redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { checkPlayerBanned } from '@/modules/bans/ban.service'
import {
  getPlayerProfile,
  getPlayerStats,
  getPlayerBookingHistory,
} from '../queries'
import { banPlayerAction, liftPlayerBanAction } from '../actions'
import { JugadorProfileView } from './JugadorProfileView'

type Props = { params: Promise<{ playerId: string }> }

export default async function JugadorProfilePage(props: Props) {
  const params = await props.params;
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/dashboard')
  const { tenant } = auth

  const data = await withTenantContext(tenant.id, async (tx) => {
    const profile = await getPlayerProfile(tenant.id, params.playerId, tx)
    if (!profile) return null
    const [stats, history, ban] = await Promise.all([
      getPlayerStats(tenant.id, params.playerId, tx),
      getPlayerBookingHistory(tenant.id, params.playerId, tx),
      checkPlayerBanned(params.playerId, tenant.id, tx),
    ])
    return { profile, stats, history, ban }
  })

  if (!data) notFound()

  return (
    <JugadorProfileView
      {...data}
      banPlayerAction={banPlayerAction}
      liftPlayerBanAction={liftPlayerBanAction}
    />
  )
}
