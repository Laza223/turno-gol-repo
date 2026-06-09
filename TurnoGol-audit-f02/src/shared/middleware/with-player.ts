import { type NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { PlayerUser } from '@/modules/auth/types'
import { withPlayerContext, type DbTx } from '@/shared/db/client'

export type PlayerHandler = (
  req: NextRequest,
  user: PlayerUser,
  tx: DbTx,
) => Promise<NextResponse> | NextResponse

export function withPlayer(handler: PlayerHandler): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
    const user = await extractAuthUser()
    if (!user) {
      return NextResponse.json(
        { error: 'unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 },
      )
    }
    if (user.type !== 'player') {
      return NextResponse.json(
        { error: 'forbidden', code: 'PLAYER_REQUIRED' },
        { status: 403 },
      )
    }
    return withPlayerContext(user.playerId, async (tx) => handler(req, user, tx))
  }
}
