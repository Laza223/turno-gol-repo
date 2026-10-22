import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getPortalSession } from '@/modules/players/portal-session'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveStaffPanelPath } from '@/modules/auth/staff-panel-path'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { withPlayerContext } from '@/shared/db/client'
import { playerFavorites } from '@/shared/db/schema'

export const dynamic = 'force-dynamic'

// GET /api/player/session — sesión mínima para hidratar el shell del portal
// client-side: las páginas públicas son ISR/estáticas y no pueden leer cookies
// en el server render. Anónimo / error → todo en null con 200 (el portal es
// público; no tener sesión no es un error). Incluye los ids de complejos
// favoritos para que el corazón hidrate sin otro round-trip.
//
// `staffPanelPath` es el acceso "Ir a mi panel" para alguien logueado como
// complejo: es SOLO una ruta de la propia app, sin email, ni nombre, ni id de
// complejo, ni cuántos tiene. No hay superficie para filtrar datos personales
// ni cruzados entre complejos porque no hay datos.
//
// `rivalEnabled` es el flag global de RIVAL (spec §12): viaja acá y no en el
// layout para que las páginas públicas sigan estáticas. Si no se puede leer,
// queda apagado: RIVAL no aparece por error.
//
// Va acá y no en un endpoint aparte por tres motivos: la portada ya hace este
// fetch en cada carga y uno nuevo duplicaría requests en la página de más
// tráfico; este endpoint ya es una excepción justificada al guardrail de Route
// Handlers y extenderla es aditivo; y el campo es hermano de `session`, no una
// unión discriminada, así que ningún consumidor existente cambia de forma.
export async function GET() {
  // Los dos están envueltos en React.cache, así que `auth.getUser()` se lee una
  // sola vez por request pese a las dos llamadas.
  const [user, session, rivalEnabled] = await Promise.all([
    extractAuthUser().catch(() => null),
    getPortalSession().catch(() => null),
    isRivalEnabled().catch(() => false),
  ])
  const staffPanelPath = resolveStaffPanelPath(user)

  if (!session) {
    return NextResponse.json(
      { data: { session: null, favoriteTenantIds: [], staffPanelPath, rivalEnabled } },
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
    { data: { session, favoriteTenantIds, staffPanelPath, rivalEnabled } },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
