import type { NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { PlayerUser } from '@/modules/auth/types'
import { withPlayerContext, type DbTx } from '@/shared/db/client'
import { forbidden, unauthorized } from '@/shared/api-error'

export type PlayerHandler = (
  req: NextRequest,
  user: PlayerUser,
  tx: DbTx,
) => Promise<NextResponse> | NextResponse

export function withPlayer(handler: PlayerHandler): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
    const user = await extractAuthUser()
    if (!user) {
      return unauthorized('Autenticación requerida.', { code: 'AUTH_REQUIRED' })
    }
    if (user.type !== 'player') {
      return forbidden('Se requiere una cuenta de jugador.', { code: 'PLAYER_REQUIRED' })
    }
    return withPlayerContext(user.playerId, async (tx) => handler(req, user, tx))
  }
}
