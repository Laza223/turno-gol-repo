'use server'

import { revalidatePath } from 'next/cache'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'

export type PolicyActionResult =
  | { success: true }
  | { success: false; error: string }

const reservasPolicySchema = z.object({
  requiresDeposit: z.boolean(),
  depositPercentage: z.number().int().min(10).max(100),
  allowOnlineBooking: z.boolean(),
  cancellationHoursBefore: z.number().int().min(0).max(72),
})

export async function updateReservasPolicyAction(
  _prevState: PolicyActionResult,
  formData: FormData,
): Promise<PolicyActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const raw = {
    requiresDeposit: formData.get('requiresDeposit') === 'true',
    depositPercentage: Number(formData.get('depositPercentage')),
    allowOnlineBooking: formData.get('allowOnlineBooking') === 'true',
    cancellationHoursBefore: Number(formData.get('cancellationHoursBefore')),
  }

  const parsed = reservasPolicySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const {
    requiresDeposit, depositPercentage, allowOnlineBooking,
    cancellationHoursBefore,
  } = parsed.data

  // Tarea #5: ya no se persiste no_show_penalty (el no-show genera deuda, sin
  // configuración por complejo).
  const patch = {
    requires_deposit: requiresDeposit,
    deposit_percentage: depositPercentage,
    allow_online_booking: allowOnlineBooking,
    cancellation_policy: {
      hours_before: cancellationHoursBefore,
      penalty_type: 'deposit',
      penalty_amount: null,
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
