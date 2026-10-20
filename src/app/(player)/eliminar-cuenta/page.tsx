import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { buildMetadata } from '@/lib/seo/metadata'
import { EliminarCuentaView } from './EliminarCuentaView'
import { requestDeleteAccountAction } from './actions'
import { countUpcomingConfirmed } from './upcoming-confirmed'

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Eliminar mi cuenta',
    description: 'Eliminar permanentemente tu cuenta TurnoGol según Ley 25.326.',
    path: '/eliminar-cuenta',
    noIndex: true,
  })
}

export default async function EliminarCuentaPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player')
    redirect(`/ingresar?next=${encodeURIComponent('/eliminar-cuenta')}`)

  const [playerRows, futureConfirmedCount] = await withPlayerContext(user.playerId, (tx) =>
    Promise.all([
      tx.select().from(players).where(eq(players.id, user.playerId)).limit(1),
      countUpcomingConfirmed(tx, user.playerId),
    ]),
  )

  const player = playerRows[0]
  if (!player) redirect(`/ingresar?next=${encodeURIComponent('/eliminar-cuenta')}`)

  return (
    <EliminarCuentaView
      futureConfirmedCount={futureConfirmedCount}
      confirmEmail={player.email}
      action={requestDeleteAccountAction}
    />
  )
}
