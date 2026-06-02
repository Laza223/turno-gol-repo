import { eq } from 'drizzle-orm'
import { withPlayer } from '@/shared/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, notFound, validationError } from '@/shared/api-error'
import { validatedJson } from '@/shared/api-output'
import { tenants } from '@/shared/db/schema'
import {
  toggleFavoriteResponseSchema,
  toggleFavoriteSchema,
} from '@/modules/favorites/favorite.schema'
import { toggleFavorite } from '@/modules/favorites/favorite.service'

export const dynamic = 'force-dynamic'

// POST /api/player/favorites/toggle — marca/desmarca un complejo como favorito.
export const POST = withPlayer(async (req, user, tx) => {
  const throttled = await guard('playerBooking', user.playerId)
  if (throttled) return throttled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.')
  }

  const parsed = toggleFavoriteSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  // tenants es global (sin RLS): validamos existencia para un 404 limpio en vez
  // de un fallo de FK al insertar.
  const tenant = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, parsed.data.tenantId))
    .limit(1)
  if (!tenant[0]) {
    return notFound('El complejo no existe.')
  }

  const result = await toggleFavorite(user.playerId, parsed.data.tenantId, tx)
  return validatedJson(
    toggleFavoriteResponseSchema,
    { data: { tenantId: parsed.data.tenantId, favorited: result.favorited } },
    'POST /api/player/favorites/toggle',
  )
})
