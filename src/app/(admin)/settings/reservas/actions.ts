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

const reservasPolicySchema = z
  .object({
    requiresDeposit: z.boolean(),
    // El % de seña solo tiene sentido cuando requiresDeposit=true: el input
    // hidden que lo transporta ni siquiera se renderiza cuando está en "Sin
    // seña", así que acá NO se puede exigir el rango incondicionalmente (si
    // no, alternar a "Sin seña" nunca guarda). El rango se valida abajo con
    // superRefine, solo cuando corresponde.
    depositPercentage: z.number().int(),
    allowOnlineBooking: z.boolean(),
    cancellationHoursBefore: z.number().int().min(0).max(72),
    bookingAdvanceDays: z.number().int().min(1).max(60),
  })
  .superRefine((data, ctx) => {
    if (data.requiresDeposit && (data.depositPercentage < 10 || data.depositPercentage > 100)) {
      ctx.addIssue({
        code: 'custom',
        path: ['depositPercentage'],
        message: 'El porcentaje de seña debe estar entre 10 y 100.',
      })
    }
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
    bookingAdvanceDays: Number(formData.get('bookingAdvanceDays')),
  }

  const parsed = reservasPolicySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const {
    requiresDeposit, depositPercentage, allowOnlineBooking,
    cancellationHoursBefore, bookingAdvanceDays,
  } = parsed.data

  // Ya no se persiste no_show_penalty: el no-show captura la seña y aplica
  // softban por reincidencia, sin configuración por complejo.
  const patch = {
    requires_deposit: requiresDeposit,
    deposit_percentage: depositPercentage,
    allow_online_booking: allowOnlineBooking,
    booking_advance_days: bookingAdvanceDays,
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
