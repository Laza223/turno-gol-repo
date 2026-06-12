'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'
import { checkPinSessionAction } from '@/app/(admin)/actions/pin'

export type PolicyActionResult =
  | { success: true }
  | { success: false; error: string }

const reservasPolicySchema = z.object({
  requiresDeposit: z.boolean(),
  depositPercentage: z.number().int().min(10).max(100),
  allowOnlineBooking: z.boolean(),
  cancellationHoursBefore: z.number().int().min(0).max(72),
  noShowPenaltyType: z.enum(['none', 'ban_days']),
  noShowPenaltyDays: z.number().int().min(1).max(30),
  noShowPenaltyThreshold: z.number().int().min(1).max(10),
})

export async function updateReservasPolicyAction(
  _prevState: PolicyActionResult,
  formData: FormData,
): Promise<PolicyActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const raw = {
    requiresDeposit: formData.get('requiresDeposit') === 'true',
    depositPercentage: Number(formData.get('depositPercentage')),
    allowOnlineBooking: formData.get('allowOnlineBooking') === 'true',
    cancellationHoursBefore: Number(formData.get('cancellationHoursBefore')),
    noShowPenaltyType: formData.get('noShowPenaltyType'),
    noShowPenaltyDays: Number(formData.get('noShowPenaltyDays')),
    noShowPenaltyThreshold: Number(formData.get('noShowPenaltyThreshold')),
  }

  const parsed = reservasPolicySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const {
    requiresDeposit, depositPercentage, allowOnlineBooking,
    cancellationHoursBefore, noShowPenaltyType, noShowPenaltyDays,
    noShowPenaltyThreshold,
  } = parsed.data

  const patch = {
    requires_deposit: requiresDeposit,
    deposit_percentage: depositPercentage,
    allow_online_booking: allowOnlineBooking,
    cancellation_policy: {
      hours_before: cancellationHoursBefore,
      penalty_type: 'deposit',
      penalty_amount: null,
    },
    no_show_penalty: {
      type: noShowPenaltyType,
      days: noShowPenaltyDays,
      threshold: noShowPenaltyThreshold,
    },
  }

  // El objeto va SIN JSON.stringify: pre-serializado llega como escalar jsonb
  // y `objeto || escalar` concatena como array, destruyendo los settings
  // (el tenant cae al wizard de onboarding al perder onboarding_completed).
  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || ${patch}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/settings/reservas')
  return { success: true }
}
