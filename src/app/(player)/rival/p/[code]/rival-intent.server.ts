import { cookies } from 'next/headers'
import {
  RIVAL_INTENT_COOKIE_NAME,
  checkRivalIntent,
  type RivalIntentCheck,
} from '@/shared/security/rival-intent'

/**
 * Lee la cookie de Google y verifica, junto con el token del enlace del mail (`?rival_intent=`),
 * si el jugador tocó "Voy" para ESTE partido. `null` = no vino ninguno (visita normal). Solo lee:
 * una cookie no se puede borrar desde un Server Component.
 */
export async function readRivalIntent(
  code: string,
  player: { email: string | null },
  linkToken: string | undefined,
): Promise<RivalIntentCheck | null> {
  const cookieToken = (await cookies()).get(RIVAL_INTENT_COOKIE_NAME)?.value
  return checkRivalIntent({ linkToken, cookieToken, email: player.email }, { code })
}

/** Gasta la cookie del intento. Solo desde una Server Action (en un Server Component lanza). */
export async function clearRivalIntentCookie(): Promise<void> {
  ;(await cookies()).delete(RIVAL_INTENT_COOKIE_NAME)
}
