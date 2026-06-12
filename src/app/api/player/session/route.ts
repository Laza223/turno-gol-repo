import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getPortalSession } from '@/components/site/portal-session'
import { withPlayerContext } from '@/shared/db/client'
import { playerFavorites } from '@/shared/db/schema'

export const dynamic = 'force-dynamic'

// GET /api/player/session — sesión mínima del jugador para hidratar el shell
// del portal client-side: las páginas públicas son ISR/estáticas y no pueden
// leer cookies en el server render. Anónimo / staff / error → session null con
// 200 (el portal es público; no tener sesión no es un error). Incluye los ids
// de complejos favoritos para que el corazón hidrate sin otro round-trip.
export async function GET() {
  const session = await getPortalSession().catch(() => null)
  if (!session) {
    return NextResponse.json(
      { data: { session: null, favoriteTenantIds: [] } },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const favoriteTenantIds = await withPlayerContext(session.playerId, (tx) =>
    tx
      .select({ tenantId: playerFavorites.tenantId })
      .from(playerFavorites)
      .where(eq(playerFavorites.playerId, session.playerId)),
  )
    .then((rows) => rows.map((r) => r.tenantId))
    .catch(() => [] as string[])

  return NextResponse.json(
    { data: { session, favoriteTenantIds } },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
