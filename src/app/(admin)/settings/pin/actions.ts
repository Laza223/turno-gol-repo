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
import { hashPin, verifyPin } from '@/modules/auth/pin'
import { checkPinSessionAction } from '@/app/(admin)/actions/pin'

export type PinConfigResult =
  | { success: true }
  | { success: false; error: string }

const changePinSchema = z
  .object({
    currentPin: z.string().min(4).max(8).regex(/^\d+$/, 'El PIN debe ser numérico'),
    newPin: z.string().min(4).max(8).regex(/^\d+$/, 'El PIN debe ser numérico'),
    confirmPin: z.string(),
  })
  .refine((d) => d.newPin === d.confirmPin, {
    message: 'Los PINes no coinciden.',
    path: ['confirmPin'],
  })

const setPinSchema = z
  .object({
    newPin: z.string().min(4).max(8).regex(/^\d+$/, 'El PIN debe ser numérico'),
    confirmPin: z.string(),
  })
  .refine((d) => d.newPin === d.confirmPin, {
    message: 'Los PINes no coinciden.',
    path: ['confirmPin'],
  })

export async function setPinAction(formData: FormData): Promise<PinConfigResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const hasExistingPin = !!tenant.settings.staff_pin_hash

  if (hasExistingPin) {
    const parsed = changePinSchema.safeParse({
      currentPin: formData.get('currentPin'),
      newPin: formData.get('newPin'),
      confirmPin: formData.get('confirmPin'),
    })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    }

    const currentOk = await verifyPin(
      parsed.data.currentPin,
      tenant.settings.staff_pin_hash!,
    )
    if (!currentOk) return { success: false, error: 'PIN actual incorrecto.' }

    const newHash = await hashPin(parsed.data.newPin)
    await _savePinHash(tenant.id, newHash)
  } else {
    const parsed = setPinSchema.safeParse({
      newPin: formData.get('newPin'),
      confirmPin: formData.get('confirmPin'),
    })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    }

    const newHash = await hashPin(parsed.data.newPin)
    await _savePinHash(tenant.id, newHash)
  }

  revalidatePath('/settings/pin')
  return { success: true }
}

async function _savePinHash(tenantId: string, hash: string): Promise<void> {
  await withTenantContext(tenantId, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || ${JSON.stringify({ staff_pin_hash: hash })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
  })
}
