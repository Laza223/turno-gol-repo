import { getPlayerHeaderInfo } from '@/modules/players/get-player-header-info'
import { isR2Configured } from '@/shared/storage/r2-config'
import { removeRivalPhotoAction, uploadRivalPhotoAction } from './photo-actions'
import type { WelcomePhoto } from './WelcomeCard'

/**
 * La foto opcional de la `WelcomeCard`, armada en el servidor: la actual del jugador y las dos
 * Server Actions. Sin storage configurado no se ofrece (`undefined`: la tarjeta queda como siempre).
 */
export async function loadWelcomePhoto(playerId: string): Promise<WelcomePhoto | undefined> {
  if (!isR2Configured()) return undefined
  const info = await getPlayerHeaderInfo(playerId)
  return {
    url: info?.avatarUrl ?? null,
    uploadAction: uploadRivalPhotoAction,
    removeAction: removeRivalPhotoAction,
  }
}
