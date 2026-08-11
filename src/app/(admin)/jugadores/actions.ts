'use server'

import { revalidatePath } from 'next/cache'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { insertAuditLog } from '@/shared/db/audit'
import {
  banPlayerManually,
  liftPlayerBan,
  resolveManualBanUntil,
} from '@/modules/bans/ban.service'
import {
  banPlayerInputSchema,
  liftPlayerBanInputSchema,
  type ManualBanDuration,
} from '@/modules/bans/ban.schema'
import { setPlayerTags } from '@/modules/relationships/ptr.service'
import { playerTagsSchema, type PlayerTag } from '@/modules/relationships/player-tags'

export type BanPlayerActionResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Ban manual del complejo (doc7 Flujo 5B, ENS-8): el encargado bloquea a un
 * jugador conflictivo de mostrador. requireOperatorStaff (admin+manager) —
 * el encargado maneja conflictos de mostrador, decisión tomada.
 */
export async function banPlayerAction(
  playerId: string,
  reason: string,
  duration: ManualBanDuration,
): Promise<BanPlayerActionResult> {
  const parsed = banPlayerInputSchema.safeParse({ playerId, reason, duration })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const bannedUntil = resolveManualBanUntil(parsed.data.duration, new Date())

  await withTenantContext(tenant.id, async (tx) => {
    await banPlayerManually(
      tenant.id,
      parsed.data.playerId,
      user.staffUserId!,
      parsed.data.reason,
      bannedUntil,
      tx,
    )
    await insertAuditLog(tx, {
      tenantId: tenant.id,
      actorId: user.staffUserId!,
      actorType: 'staff',
      action: 'player.banned',
      resourceType: 'player',
      resourceId: parsed.data.playerId,
      metadata: {
        reason: parsed.data.reason,
        duration: parsed.data.duration,
        bannedUntil: bannedUntil ? bannedUntil.toISOString() : null,
      },
    })
  })

  revalidatePath(`/jugadores/${parsed.data.playerId}`)
  return { success: true }
}

/**
 * Levanta el ban vigente (manual o softban automático) de un jugador. No-op
 * (success:false, sin auditar) si no había ningún ban vigente para levantar
 * — ver liftPlayerBan en ban.service.ts para el modelo elegido.
 */
export async function liftPlayerBanAction(playerId: string): Promise<BanPlayerActionResult> {
  const parsed = liftPlayerBanInputSchema.safeParse({ playerId })
  if (!parsed.success) {
    return { success: false, error: 'ID inválido.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const lifted = await withTenantContext(tenant.id, async (tx) => {
    const didLift = await liftPlayerBan(tenant.id, parsed.data.playerId, tx)
    if (didLift) {
      await insertAuditLog(tx, {
        tenantId: tenant.id,
        actorId: user.staffUserId!,
        actorType: 'staff',
        action: 'player.ban_lifted',
        resourceType: 'player',
        resourceId: parsed.data.playerId,
      })
    }
    return didLift
  })

  if (!lifted) return { success: false, error: 'No había ningún bloqueo vigente para levantar.' }

  revalidatePath(`/jugadores/${parsed.data.playerId}`)
  return { success: true }
}

/**
 * Etiquetas de cliente (B12 / D3). `requireOperatorStaff` (admin + manager),
 * mismo criterio que el ban manual: el encargado es quien atiende el mostrador
 * y es el que sabe a quién se le fía.
 *
 * Guarda el SET COMPLETO, no un delta: la ficha manda el estado final de los
 * checkboxes, así que dos guardados concurrentes no dejan una etiqueta a medio
 * aplicar — gana el último, y el audit log deja las dos versiones.
 */
export async function setPlayerTagsAction(
  playerId: string,
  tags: string[],
): Promise<BanPlayerActionResult> {
  const parsedTags = playerTagsSchema.safeParse(tags)
  if (!parsedTags.success) {
    return { success: false, error: parsedTags.error.issues[0]?.message ?? 'Etiquetas inválidas.' }
  }
  const parsedId = liftPlayerBanInputSchema.safeParse({ playerId })
  if (!parsedId.success) return { success: false, error: 'ID inválido.' }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const updated = await setPlayerTags(
      tenant.id,
      parsedId.data.playerId,
      parsedTags.data as PlayerTag[],
      tx,
    )
    if (!updated) return null
    await insertAuditLog(tx, {
      tenantId: tenant.id,
      actorId: user.staffUserId!,
      actorType: 'staff',
      action: 'player.tags_updated',
      resourceType: 'player',
      resourceId: parsedId.data.playerId,
      metadata: { before: updated.before, after: updated.after },
    })
    return updated
  })

  if (!result) {
    return { success: false, error: 'Ese jugador no está vinculado a este complejo.' }
  }

  revalidatePath(`/jugadores/${parsedId.data.playerId}`)
  revalidatePath('/jugadores')
  return { success: true }
}
