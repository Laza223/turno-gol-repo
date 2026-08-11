import { and, desc, eq } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { playerFavorites, tenants } from '@/shared/db/schema'
import type { FavoriteCard, ToggleFavoriteResult } from './favorite.types'

// Todas las funciones corren dentro de withPlayerContext (RLS app.current_player_id).

/**
 * Alterna el favorito del jugador para un complejo. Si ya existe lo elimina
 * (favorited=false); si no, lo crea (favorited=true). Idempotente ante carreras
 * gracias a uq_player_favorites_player_tenant + onConflictDoNothing.
 */
export async function toggleFavorite(
  playerId: string,
  tenantId: string,
  tx: DbTx,
): Promise<ToggleFavoriteResult> {
  const existing = await tx
    .select({ id: playerFavorites.id })
    .from(playerFavorites)
    .where(and(eq(playerFavorites.playerId, playerId), eq(playerFavorites.tenantId, tenantId)))
    .limit(1)

  if (existing[0]) {
    await tx.delete(playerFavorites).where(eq(playerFavorites.id, existing[0].id))
    return { favorited: false }
  }

  await tx.insert(playerFavorites).values({ playerId, tenantId }).onConflictDoNothing()
  return { favorited: true }
}

export async function isFavorite(playerId: string, tenantId: string, tx: DbTx): Promise<boolean> {
  const rows = await tx
    .select({ id: playerFavorites.id })
    .from(playerFavorites)
    .where(and(eq(playerFavorites.playerId, playerId), eq(playerFavorites.tenantId, tenantId)))
    .limit(1)
  return Boolean(rows[0])
}

export async function getFavorites(playerId: string, tx: DbTx): Promise<FavoriteCard[]> {
  const rows = await tx
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      city: tenants.city,
      province: tenants.province,
      logoUrl: tenants.logoUrl,
      coverUrl: tenants.coverUrl,
      fromPriceCents: tenants.fromPriceCents,
      createdAt: playerFavorites.createdAt,
    })
    .from(playerFavorites)
    .innerJoin(tenants, eq(tenants.id, playerFavorites.tenantId))
    .where(eq(playerFavorites.playerId, playerId))
    .orderBy(desc(playerFavorites.createdAt))

  return rows.map((r) => ({
    tenantId: r.tenantId,
    slug: r.slug,
    name: r.name,
    city: r.city,
    province: r.province,
    logoUrl: r.logoUrl ?? null,
    coverUrl: r.coverUrl ?? null,
    fromPriceCents: r.fromPriceCents ?? null,
    createdAt: r.createdAt,
  }))
}
