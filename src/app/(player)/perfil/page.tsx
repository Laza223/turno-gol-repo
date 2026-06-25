import { redirect } from 'next/navigation'
import Image from 'next/image'
import { eq } from 'drizzle-orm'
import { User } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { initials } from '@/lib/format'
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
import PlayerHeroBand from '@/components/site/PlayerHeroBand'
import { ProfileForm } from './ProfileForm'
import FavoritesList from './FavoritesList'
import ActivityStats from './ActivityStats'
import NotificationPrefs from './NotificationPrefs'

const TABS = [
  { key: 'datos', label: 'Datos' },
  { key: 'favoritos', label: 'Favoritos' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'notificaciones', label: 'Avisos' },
] as const

type TabKey = (typeof TABS)[number]['key']

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

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const tab: TabKey = TABS.some((t) => t.key === searchParams.tab)
    ? (searchParams.tab as TabKey)
    : 'datos'

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.select().from(players).where(eq(players.id, user.playerId)).limit(1),
  )

  const player = rows[0]
  if (!player) redirect('/ingresar')

  const favorites = tab === 'favoritos' ? await loadFavorites(user.playerId) : null

  // Día actual en ART (UTC-3) para anclar la semana de la racha.
  const activity =
    tab === 'actividad'
      ? await withPlayerContext(user.playerId, (tx) => getPlayerActivity(user.playerId, tx))
      : null
  const artToday = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <PlayerHeroBand eyebrow="Tu cuenta" title="Mi" accent="perfil">
        <div className="mt-4 flex items-center gap-4">
          {player.avatarUrl ? (
            <Image
              src={player.avatarUrl}
              alt="Avatar"
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover ring-1 ring-white/15"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full font-display text-xl font-black italic text-emerald-200 ring-1 ring-emerald-400/30"
              style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.28), rgba(2,6,23,.4))' }}
            >
              {initials(player.firstName, player.lastName)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-black italic tracking-tight text-white">
              {player.firstName} {player.lastName}
            </p>
            <p className="truncate text-sm text-slate-400">{player.email}</p>
          </div>
        </div>
      </PlayerHeroBand>

      {/* Tabs como segmented control premium (mismo patrón que /mis-reservas) */}
      <div className="flex gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`/perfil?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`flex-1 rounded-full py-2 text-center text-sm font-semibold transition-all duration-150 ${
              tab === t.key
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

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
          />

          {/* Legal notice */}
          {player.agreedToTermsAt && (
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p className="text-xs text-slate-500">
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
        <NotificationPrefs initialEmail={player.notifyEmail} initialPush={player.notifyPush} />
      )}
    </div>
  )
}
