import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { User } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { getFavorites } from '@/modules/favorites/favorite.service'
import {
  getCourtPhotosByTenant,
  searchPublicTenants,
  type PublicTenantCard,
} from '@/modules/tenants/search.service'
import {
  computeStreakWeeks,
  getPlayerActivity,
  isoMondayOf,
} from '@/modules/players/activity.service'
import { ProfileForm } from './ProfileForm'
import FavoritesList from './FavoritesList'
import ActivityStats from './ActivityStats'
import NotificationPrefs from './NotificationPrefs'
import { ProfileHeaderNav, PROFILE_TABS, type ProfileTabKey } from './ProfileHeaderNav'
import { updateProfileAction, updateNotificationPrefAction } from './actions'
import { artTodayStr } from '@/shared/dates/art'

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

/**
 * Favoritos del jugador con el shape que TenantCard espera: ids desde
 * player_favorites (RLS por player) y datos públicos vía searchPublicTenants
 * (mismo origen que /explorar, filtra tenants no visibles). Se preserva el
 * orden "último favorito primero" — search ordena alfabético. Cap de 50
 * favoritos (límite del search público), suficiente para v1.
 */
async function loadFavorites(playerId: string): Promise<{
  tenants: PublicTenantCard[]
  photosByTenant: Record<string, string[]>
}> {
  const favs = await withPlayerContext(playerId, (tx) => getFavorites(playerId, tx))
  if (favs.length === 0) return { tenants: [], photosByTenant: {} }

  const ids = favs.slice(0, 50).map((f) => f.tenantId)
  const { results } = await searchPublicTenants({ tenantIds: ids, limit: 50 })
  const order = new Map(ids.map((id, i) => [id, i]))
  const tenants = [...results].sort(
    (a, b) => (order.get(a.id) ?? ids.length) - (order.get(b.id) ?? ids.length),
  )
  const photosByTenant = await getCourtPhotosByTenant(tenants.map((t) => t.id))
  return { tenants, photosByTenant }
}

export default async function PerfilPage(
  props: {
    searchParams: Promise<{ tab?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const user = await extractAuthUser()
  if (!user || user.type !== 'player')
    redirect(`/ingresar?next=${encodeURIComponent('/perfil')}`)

  const tab: ProfileTabKey = PROFILE_TABS.some((t) => t.key === searchParams.tab)
    ? (searchParams.tab as ProfileTabKey)
    : 'datos'

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.select().from(players).where(eq(players.id, user.playerId)).limit(1),
  )

  const player = rows[0]
  if (!player) redirect(`/ingresar?next=${encodeURIComponent('/perfil')}`)

  const favorites = tab === 'favoritos' ? await loadFavorites(user.playerId) : null

  // Día actual en ART (UTC-3) para anclar la semana de la racha.
  const activity =
    tab === 'actividad'
      ? await withPlayerContext(user.playerId, (tx) => getPlayerActivity(user.playerId, tx))
      : null
  const artToday = artTodayStr()

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <ProfileHeaderNav
        firstName={player.firstName}
        lastName={player.lastName}
        email={player.email}
        avatarUrl={player.avatarUrl}
        tab={tab}
      />

      {tab === 'datos' && (
        <>
          <ProfileForm
            defaultValues={{
              firstName: player.firstName,
              lastName: player.lastName,
              phone: player.phone ?? '',
              preferredArea: player.preferredArea ?? '',
              email: player.email,
            }}
            action={updateProfileAction}
          />

          {/* Legal notice */}
          {player.agreedToTermsAt && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Términos aceptados el {formatDate(player.agreedToTermsAt)}
                {player.termsVersion ? ` (versión ${player.termsVersion})` : ''}.
              </p>
            </div>
          )}
        </>
      )}

      {tab === 'favoritos' && favorites && (
        <FavoritesList
          tenants={favorites.tenants}
          photosByTenant={favorites.photosByTenant}
        />
      )}

      {tab === 'actividad' && activity && (
        <ActivityStats
          played={activity.played}
          venues={activity.venues}
          streakWeeks={computeStreakWeeks(activity.weeksWithGames, isoMondayOf(artToday))}
        />
      )}

      {tab === 'notificaciones' && (
        <NotificationPrefs
          initialEmail={player.notifyEmail}
          initialPush={player.notifyPush}
          action={updateNotificationPrefAction}
        />
      )}
    </div>
  )
}
