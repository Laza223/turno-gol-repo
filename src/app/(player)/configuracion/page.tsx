import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { artTodayStr } from '@/shared/dates/art'
import { getFavorites } from '@/modules/favorites/favorite.service'
import { searchPublicTenants } from '@/modules/tenants/search.service'
import {
  computeStreakWeeks,
  getPlayerActivity,
  isoMondayOf,
} from '@/modules/players/activity.service'
import { buildMetadata } from '@/lib/seo/metadata'
import { ConfiguracionView } from './ConfiguracionView'
import type { FavoriteRow } from './FavoritesList'
import { updateProfileAction } from './actions'

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Mi cuenta',
    description: 'Tu cuenta TurnoGol: tus datos, tus favoritos, tu actividad y la baja.',
    path: '/configuracion',
    noIndex: true,
  })
}

/**
 * Favoritos del jugador, más reciente primero: los ids salen de player_favorites (RLS por player)
 * y los datos públicos de searchPublicTenants (mismo origen que /explorar: no lista un complejo
 * que ya no está visible). Tope de 50, el del search público.
 */
async function loadFavorites(playerId: string): Promise<FavoriteRow[]> {
  const favs = await withPlayerContext(playerId, (tx) => getFavorites(playerId, tx))
  if (favs.length === 0) return []

  const ids = favs.slice(0, 50).map((f) => f.tenantId)
  const { results } = await searchPublicTenants({ tenantIds: ids, limit: 50 })
  const order = new Map(ids.map((id, i) => [id, i]))
  return [...results]
    .sort((a, b) => (order.get(a.id) ?? ids.length) - (order.get(b.id) ?? ids.length))
    .map((t) => ({ id: t.id, slug: t.slug, name: t.name, city: t.city }))
}

export default async function ConfiguracionPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player')
    redirect(`/ingresar?next=${encodeURIComponent('/configuracion')}`)

  const [rows, favorites, activityRaw] = await Promise.all([
    withPlayerContext(user.playerId, (tx) =>
      tx.select().from(players).where(eq(players.id, user.playerId)).limit(1),
    ),
    loadFavorites(user.playerId),
    withPlayerContext(user.playerId, (tx) => getPlayerActivity(user.playerId, tx)),
  ])

  const player = rows[0]
  if (!player) redirect(`/ingresar?next=${encodeURIComponent('/configuracion')}`)

  return (
    <ConfiguracionView
      profile={{
        firstName: player.firstName,
        lastName: player.lastName,
        phone: player.phone ?? '',
        preferredArea: player.preferredArea ?? '',
      }}
      email={player.email}
      favorites={favorites}
      // Día actual en ART (UTC-3) para anclar la semana de la racha.
      activity={{
        played: activityRaw.played,
        venues: activityRaw.venues,
        streakWeeks: computeStreakWeeks(activityRaw.weeksWithGames, isoMondayOf(artTodayStr())),
      }}
      updateProfileAction={updateProfileAction}
      signOutAction={signOutAction}
    />
  )
}
