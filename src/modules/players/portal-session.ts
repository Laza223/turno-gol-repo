import { cache } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getPlayerHeaderInfo } from './get-player-header-info'

export type PortalSession = {
  playerId: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  email: string
}

/**
 * Sesión del jugador para el shell del portal (cabecera + bottom-nav).
 * Devuelve `null` si no hay jugador logueado (anónimo, staff o admin).
 * Cacheado por request para no repetir la lectura de auth ni la query.
 * Server-only (lee cookies): hoy lo consume GET /api/player/session, que es
 * lo que hidrata el shell client-side sin volver dynamic a las rutas ISR.
 */
export const getPortalSession = cache(async (): Promise<PortalSession | null> => {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') return null

  const info = await getPlayerHeaderInfo(user.playerId)
  if (!info) return null

  return { playerId: user.playerId, ...info }
})
