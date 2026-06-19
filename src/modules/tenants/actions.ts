'use server'

import { revalidatePath } from 'next/cache'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { getStaffTenant, updateTenant, updateTenantSettings } from './tenant.service'
import { updateTenantSchema, updateTenantSettingsSchema } from './tenant.schema'
import type { UpdateTenantInput, UpdateTenantSettingsInput } from './tenant.types'

export type TenantActionResult = { success: true } | { success: false; error: string }

export async function updateTenantAction(
  data: UpdateTenantInput,
): Promise<TenantActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    return { success: false, error: 'No autorizado' }
  }
  const parsed = updateTenantSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  await updateTenant(tenant.id, parsed.data)
  revalidatePath('/settings/facturacion')
  return { success: true }
}

export async function updateTenantSettingsAction(
  data: UpdateTenantSettingsInput,
): Promise<TenantActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    return { success: false, error: 'No autorizado' }
  }
  const parsed = updateTenantSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  await updateTenantSettings(tenant.id, parsed.data)
  revalidatePath('/settings/facturacion')
  return { success: true }
}
