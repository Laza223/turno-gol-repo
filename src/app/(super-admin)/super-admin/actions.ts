'use server'

import { revalidatePath } from 'next/cache'
import { uuid } from '@/shared/validation/primitives'
import { requireSystemAdminAction } from '@/modules/auth/system-admin.guards'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import {
  approveReferralReward,
  markReferralRewardApplied,
  rejectReferralReward,
} from '@/modules/referrals/referral-reward.service'
import type { ActionResult } from '@/shared/types/action-result'

/**
 * Los tres botones del bloque "Premios de referidos" del Pulso (R4,
 * `docs/decisions/2026-09-26-referidos.md`). Cada service es un CAS sobre el
 * estado anterior: un doble click devuelve "ya estaba hecho", nunca aplica dos
 * veces.
 */

export type ReferralRewardActionResult = ActionResult<{ message: string }>

const ALREADY_PROCESSED = 'Este premio ya se había procesado. Recargá para ver cómo quedó.'
const NOT_FOUND = 'No encontramos ese complejo.'

function revalidateRewardPaths(referredTenantId: string, referrerTenantId?: string | null): void {
  revalidatePath('/super-admin')
  revalidatePath(`/super-admin/tenants/${referredTenantId}`)
  // Viene del cliente y solo sirve para revalidar: si no es un uuid, se ignora.
  if (referrerTenantId && uuid.safeParse(referrerTenantId).success) {
    revalidatePath(`/super-admin/tenants/${referrerTenantId}`)
  }
}

export async function approveReferralRewardAction(
  referredTenantId: string,
  referrerTenantId: string | null,
): Promise<ReferralRewardActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = uuid.safeParse(referredTenantId)
  if (!parsed.success) return { success: false, error: NOT_FOUND }

  const result = await approveReferralReward(parsed.data, auth.admin.id, getBillingGateway())
  if (!result.ok) {
    if (result.reason === 'referrer_inactive') {
      return {
        success: false,
        error: 'El complejo que lo trajo ya no tiene la cuenta vigente: el premio no se aplica.',
      }
    }
    return {
      success: false,
      error: result.reason === 'not_found' ? NOT_FOUND : ALREADY_PROCESSED,
    }
  }

  revalidateRewardPaths(parsed.data, referrerTenantId)
  return {
    success: true,
    message:
      result.applied === 'trial_extended'
        ? 'Listo: su prueba se extendió 30 días.'
        : 'Aprobado. Falta devolverle su próximo cobro en MercadoPago.',
  }
}

export async function markReferralRewardAppliedAction(
  referredTenantId: string,
  referrerTenantId: string | null,
): Promise<ReferralRewardActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = uuid.safeParse(referredTenantId)
  if (!parsed.success) return { success: false, error: NOT_FOUND }

  const result = await markReferralRewardApplied(parsed.data, auth.admin.id)
  if (!result.ok) {
    if (result.reason === 'referrer_inactive') {
      return {
        success: false,
        error:
          'El complejo que lo trajo se dio de baja: el premio se perdió. Rechazalo como "No corresponde".',
      }
    }
    return { success: false, error: result.reason === 'not_found' ? NOT_FOUND : ALREADY_PROCESSED }
  }

  revalidateRewardPaths(parsed.data, referrerTenantId)
  return { success: true, message: 'Premio marcado como acreditado.' }
}

export async function rejectReferralRewardAction(
  referredTenantId: string,
  referrerTenantId: string | null,
): Promise<ReferralRewardActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = uuid.safeParse(referredTenantId)
  if (!parsed.success) return { success: false, error: NOT_FOUND }

  const result = await rejectReferralReward(parsed.data, auth.admin.id)
  if (!result.ok) {
    return { success: false, error: result.reason === 'not_found' ? NOT_FOUND : ALREADY_PROCESSED }
  }

  revalidateRewardPaths(parsed.data, referrerTenantId)
  return { success: true, message: 'Premio rechazado.' }
}
