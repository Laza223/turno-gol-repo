'use server'

import { revalidatePath } from 'next/cache'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'

export type PolicyActionResult = { success: true } | { success: false; error: string }

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
    bookingMinAdvanceHours: z.number().int().min(0).max(48),
    // Solo sin seña (el input no se renderiza con seña → llega 0 y no se guarda).
    lateCancelHours: z.number().int().min(0).max(24),
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
    bookingMinAdvanceHours: Number(formData.get('bookingMinAdvanceHours')),
    lateCancelHours: Number(formData.get('lateCancelHours')),
  }

  const parsed = reservasPolicySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const {
    requiresDeposit,
    depositPercentage,
    allowOnlineBooking,
    cancellationHoursBefore,
    bookingAdvanceDays,
    bookingMinAdvanceHours,
    lateCancelHours,
  } = parsed.data

  // 🔴 F-003 (QA de producción 2026-08-17): exigir seña sin MercadoPago conectado
  // deja al jugador colgado — el checkout público muestra "Seña a pagar ahora", el
  // booking nace `pending_payment` porque no hay `mpAccessToken` con el que crear
  // la preferencia, y expira solo por hold. Nadie ve un error: el complejo pierde
  // reservas sin enterarse. El estado de la conexión se lee del tenant que ya trajo
  // el guard desde la DB, nunca de un campo del form.
  if (requiresDeposit && !tenant.mpConnectedAt) {
    return {
      success: false,
      error:
        'Para cobrar seña primero conectá MercadoPago, abajo en esta misma pantalla. Hasta entonces, dejá "Sin seña".',
    }
  }

  // Ya no se persiste no_show_penalty: el no-show captura la seña y aplica
  // softban por reincidencia, sin configuración por complejo.
  //
  // `deposit_percentage` SOLO se toca con la seña prendida: con el toggle en
  // "Sin seña" el input hidden del porcentaje ni se renderiza, así que
  // `Number(null)` llegaba como 0 y guardar pisaba el porcentaje configurado
  // con un valor fuera del rango válido (10-100). Como el patch se aplica con
  // `settings || patch`, omitir la clave deja el valor guardado intacto.
  const patch = {
    requires_deposit: requiresDeposit,
    ...(requiresDeposit ? { deposit_percentage: depositPercentage } : {}),
    allow_online_booking: allowOnlineBooking,
    booking_advance_days: bookingAdvanceDays,
    booking_min_advance_hours: bookingMinAdvanceHours,
    // Con seña manda la política de devolución y la penalidad por cancelar tarde se APAGA
    // (el control no se muestra: no puede quedar activa e invisible). Sin seña, al revés:
    // `cancellation_policy` no se toca, porque su input no se renderiza (Number(null) = 0).
    ...(requiresDeposit
      ? {
          cancellation_policy: {
            hours_before: cancellationHoursBefore,
            penalty_type: 'deposit',
            penalty_amount: null,
          },
          late_cancel_hours: 0,
        }
      : { late_cancel_hours: lateCancelHours }),
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
