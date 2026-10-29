'use server'

import { revalidatePath } from 'next/cache'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import {
  removePlayerPhoto,
  setPlayerPhoto,
  validatePhotoUpload,
} from '@/modules/players/player-photo.service'
import {
  RIVAL_DISABLED_MESSAGE,
  RIVAL_NO_SESSION_MESSAGE,
  RIVAL_RATE_LIMITED_MESSAGE,
} from '@/modules/rival/rival-copy'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { captureException } from '@/lib/sentry'
import { enforce } from '@/shared/rate-limit'
import type { ActionResult } from '@/shared/types/action-result'
import { isR2Configured } from '@/shared/storage/r2-config'

/** Resultado de subir o quitar la foto: `url` es la nueva (o `null` si se quitó). */
export type RivalPhotoResult = ActionResult<{ url: string | null }>

const GENERIC = 'No pudimos subir la foto. Probá de nuevo en un momento.'

const fail = (error: string): RivalPhotoResult => ({ success: false, error })

/** Mismo orden que el `guard` de `./actions`: flag → sesión de jugador → rate limit. */
async function guard(): Promise<{ playerId: string } | { error: string }> {
  if (!(await isRivalEnabled())) return { error: RIVAL_DISABLED_MESSAGE }
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') return { error: RIVAL_NO_SESSION_MESSAGE }
  const rl = await enforce('rivalPhoto', user.playerId)
  if (!rl.ok) return { error: RIVAL_RATE_LIMITED_MESSAGE }
  return { playerId: user.playerId }
}

function refresh(): void {
  revalidatePath('/configuracion')
  revalidatePath('/rival', 'layout')
}

/** Sube (o reemplaza) la foto del jugador de la sesión. El archivo llega ya recortado del cliente. */
export async function uploadRivalPhotoAction(formData: FormData): Promise<RivalPhotoResult> {
  const g = await guard()
  if ('error' in g) return fail(g.error)
  if (!isR2Configured())
    return fail('No pudimos subir la foto ahora. Probá de nuevo en un momento.')

  const file = formData.get('file')
  if (!(file instanceof Blob) || file.size === 0) return fail('Elegí una foto.')
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const check = validatePhotoUpload(bytes)
    if (!check.ok) return fail(check.error)
    const url = await setPlayerPhoto(g.playerId, bytes)
    refresh()
    return { success: true, url }
  } catch (err) {
    captureException(err)
    return fail(GENERIC)
  }
}

/** Quita la foto del jugador de la sesión (y su archivo). */
export async function removeRivalPhotoAction(): Promise<RivalPhotoResult> {
  const g = await guard()
  if ('error' in g) return fail(g.error)
  try {
    await removePlayerPhoto(g.playerId)
    refresh()
    return { success: true, url: null }
  } catch (err) {
    captureException(err)
    return fail('No pudimos quitar la foto. Probá de nuevo en un momento.')
  }
}
