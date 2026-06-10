import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'

export type PlayerHeaderInfo = {
  firstName: string
  lastName: string
  avatarUrl: string | null
  email: string
}

/**
 * Datos mínimos del jugador para la cabecera del portal (chip de sesión).
 * Cacheado por request (React.cache) para que `PortalShell` y `PortalHeader`
 * compartan una sola query.
 */
export const getPlayerHeaderInfo = cache(
  async (playerId: string): Promise<PlayerHeaderInfo | null> => {
    const rows = await withPlayerContext(playerId, (tx) =>
      tx
        .select({
          firstName: players.firstName,
          lastName: players.lastName,
          avatarUrl: players.avatarUrl,
          email: players.email,
        })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1),
    )
    return rows[0] ?? null
  },
)
