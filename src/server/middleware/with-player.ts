// Vive en `@/server` (composition root del runtime web), no en `@/shared`: ver
// el bloque `turnogol/capas-server` de eslint.config.mjs.
import type { NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { PlayerUser } from '@/modules/auth/types'
import { withPlayerContext, type DbTx } from '@/shared/db/client'
import { captureException } from '@/lib/sentry'
import { forbidden, internal, unauthorized } from '@/shared/api-error'
import { runRequestObservability } from '@/shared/middleware/observability'

export type PlayerHandler = (
  req: NextRequest,
  user: PlayerUser,
  tx: DbTx,
) => Promise<NextResponse> | NextResponse

export function withPlayer(handler: PlayerHandler): (req: NextRequest) => Promise<NextResponse> {
  const run = async (req: NextRequest): Promise<NextResponse> => {
    const user = await extractAuthUser()
    if (!user) {
      return unauthorized('Autenticación requerida.', { code: 'AUTH_REQUIRED' })
    }
    if (user.type !== 'player') {
      return forbidden('Se requiere una cuenta de jugador.', { code: 'PLAYER_REQUIRED' })
    }
    try {
      return await withPlayerContext(user.playerId, async (tx) => handler(req, user, tx))
    } catch (err) {
      captureException(err)
      return internal('Ocurrió un error inesperado. Probá de nuevo en unos segundos.')
    }
  }
  return (req) => runRequestObservability(req, () => run(req))
}
