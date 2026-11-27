'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { ensureReferralCode } from '@/modules/referrals/referral.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import type { ActionResult } from '@/shared/types/action-result'

/**
 * "Generar mi link": crea el código de referido del complejo si no lo tiene
 * (idempotente). Respaldo: el alta ya lo genera, esto cubre si esa generación falló.
 */
export async function generateReferralLinkAction(): Promise<ActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  await ensureReferralCode(tenant.id)

  revalidatePath('/settings/invitar')
  // El aviso de Hoy se muestra recién cuando hay código.
  revalidatePath('/dashboard')
  return { success: true }
}
