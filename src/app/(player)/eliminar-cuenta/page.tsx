import { redirect } from 'next/navigation'
import { eq, and, gte, sql } from 'drizzle-orm'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players, bookings } from '@/shared/db/schema'
import { buildMetadata } from '@/lib/seo/metadata'
import { artTodayStr } from '@/shared/dates/art'
import { EliminarCuentaView } from './EliminarCuentaView'
import { requestDeleteAccountAction } from './actions'

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

  const [playerRows, futureBookingRows] = await withPlayerContext(user.playerId, async (tx) => {
    const todayDate = new Date(`${artTodayStr()}T00:00:00Z`)
    return Promise.all([
      tx.select().from(players).where(eq(players.id, user.playerId)).limit(1),
      tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(bookings)
        .where(
          and(
            eq(bookings.playerId, user.playerId),
            eq(bookings.status, 'confirmed'),
            gte(bookings.date, todayDate),
          ),
        ),
    ])
  })

  const player = playerRows[0]
  if (!player) redirect(`/ingresar?next=${encodeURIComponent('/eliminar-cuenta')}`)

  const futureConfirmedCount = futureBookingRows[0]?.count ?? 0

  return (
    <EliminarCuentaView
      futureConfirmedCount={futureConfirmedCount}
      confirmEmail={player.email}
      action={requestDeleteAccountAction}
    />
  )
}
