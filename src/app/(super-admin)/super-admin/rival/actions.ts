'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid } from '@/shared/validation/primitives'
import { requireSystemAdminAction } from '@/modules/auth/system-admin.guards'
import {
  hideMatch,
  removePlayerAvatar,
  restoreMatch,
} from '@/modules/super-admin/rival-moderation.service'
import { logger } from '@/shared/lib/logger'
import type { ActionResult } from '@/shared/types/action-result'

/**
 * Moderación de RIVAL (spec §8). Orden: guard (con su rate limit) → Zod → servicio →
 * revalidatePath. Ante cualquier falla devuelve el mismo mensaje, sin diferenciar motivo.
 */

const FAILED = 'No se pudo completar la acción.'

const matchInput = z.object({ matchId: uuid })
const avatarInput = z.object({ playerId: uuid, matchId: uuid })

async function run<T>(
  input: unknown,
  schema: z.ZodType<T>,
  op: (adminId: string, data: T) => Promise<void>,
): Promise<ActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { success: false, error: FAILED }
  try {
    await op(auth.admin.id, parsed.data)
  } catch (err) {
    logger.error('super-admin rival: moderación falló', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { success: false, error: FAILED }
  }
  revalidatePath('/super-admin/rival')
  return { success: true }
}

export async function hideRivalMatchAction(input: { matchId: string }): Promise<ActionResult> {
  return run(input, matchInput, (adminId, d) => hideMatch(d.matchId, adminId))
}

export async function restoreRivalMatchAction(input: { matchId: string }): Promise<ActionResult> {
  return run(input, matchInput, (adminId, d) => restoreMatch(d.matchId, adminId))
}

export async function removeRivalAvatarAction(input: {
  playerId: string
  matchId: string
}): Promise<ActionResult> {
  return run(input, avatarInput, (adminId, d) => removePlayerAvatar(d.playerId, d.matchId, adminId))
}
