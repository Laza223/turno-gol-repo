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
import { ProfileForm } from './ProfileForm'
import FavoritesList from './FavoritesList'

const TABS = [
  { key: 'datos', label: 'Datos' },
  { key: 'favoritos', label: 'Favoritos' },
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
  if (!user || user.type !== 'player') redirect('/login')

  const tab: TabKey = TABS.some((t) => t.key === searchParams.tab)
    ? (searchParams.tab as TabKey)
    : 'datos'

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.select().from(players).where(eq(players.id, user.playerId)).limit(1),
  )

  const player = rows[0]
  if (!player) redirect('/login')

  const favorites = tab === 'favoritos' ? await loadFavorites(user.playerId) : null

  return (
    <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-900">Mi Perfil</h1>

      {/* Avatar + name */}
      <div className="flex items-center gap-4">
        {player.avatarUrl ? (
          <Image
            src={player.avatarUrl}
            alt="Avatar"
            width={64}
            height={64}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xl font-semibold">
            {initials(player.firstName, player.lastName)}
          </div>
        )}
        <div>
          <p className="text-base font-semibold text-slate-900">
            {player.firstName} {player.lastName}
          </p>
          <p className="text-sm text-slate-500">{player.email}</p>
        </div>
      </div>

      {/* Tabs (server-side, mismo patrón que /mis-reservas) */}
      <div className="flex border-b border-slate-200">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`/perfil?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`flex-1 text-center py-2 text-sm font-medium transition-colors duration-150 ${
              tab === t.key
                ? 'border-b-2 border-emerald-600 text-emerald-700'
                : 'text-slate-500 hover:text-slate-900'
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
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3">
              <User className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
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
    </div>
  )
}
