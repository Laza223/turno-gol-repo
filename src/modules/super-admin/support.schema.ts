import { z } from 'zod'
import { uuid } from '@/shared/validation/primitives'
import type { TenantStatus } from '@/modules/billing/billing.types'

/**
 * Validación pura de las acciones de soporte del SuperAdmin (spec §5).
 * Separada de support.service.ts para que las Server Actions importen un
 * archivo *.schema (regression guard tests/unit/zod-coverage.test.ts) y para
 * que sea unit-testeable sin DB.
 */

/** Estados destino destructivos: exigen confirmación tipo GitHub (spec §5). */
export const DESTRUCTIVE_TARGET_STATUSES: readonly TenantStatus[] = ['blocked', 'deleted']

export function isDestructiveTargetStatus(status: TenantStatus): boolean {
  return DESTRUCTIVE_TARGET_STATUSES.includes(status)
}

/**
 * Confirmación tipo GitHub: el nombre tipeado debe coincidir EXACTO con el
 * nombre del tenant (solo se tolera whitespace en los bordes).
 */
export function confirmNameMatches(expectedName: string, provided: string): boolean {
  return provided.trim() === expectedName
}

export const extendTrialInputSchema = z.object({
  tenantId: uuid,
  days: z.number().int().min(1).max(90),
})

export const forceStatusInputSchema = z.object({
  tenantId: uuid,
  targetStatus: z.enum([
    'trialing',
    'active',
    'past_due',
    'suspended',
    'blocked',
    'canceled',
    'churned',
    'deleted',
  ]),
  confirmName: z.string().max(120).optional(),
})

export const reactivateInputSchema = z.object({ tenantId: uuid })

export const changePlanInputSchema = z.object({
  tenantId: uuid,
  targetPlanId: uuid,
})

export const cancelSubscriptionInputSchema = z.object({
  tenantId: uuid,
  reason: z.string().trim().min(3).max(500),
  confirmName: z.string().max(120),
})

/**
 * Whitelist de settings editables por soporte: exactamente los campos de
 * `UpdateTenantSettingsInput` (tenant.types.ts). `z.strictObject` rechaza
 * cualquier campo extra — nunca JSON libre.
 */
export const settingsPatchSchema = z
  .strictObject({
    requires_deposit: z.boolean().optional(),
    deposit_percentage: z.number().int().min(0).max(100).optional(),
    cancellation_policy: z
      .object({
        hours_before: z.number().int().min(0).max(168),
        penalty_type: z.enum(['deposit', 'full']),
        penalty_amount: z.number().int().nonnegative().nullable(),
      })
      .optional(),
    accepts_cash: z.boolean().optional(),
    accepts_transfer: z.boolean().optional(),
    accepts_mercadopago: z.boolean().optional(),
    allow_online_booking: z.boolean().optional(),
    booking_advance_days: z.number().int().min(1).max(60).optional(),
    auto_complete_minutes: z.number().int().min(0).max(1440).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'El patch de settings no puede estar vacío.',
  })

export const updateSettingsInputSchema = z.object({
  tenantId: uuid,
  patch: settingsPatchSchema,
})
