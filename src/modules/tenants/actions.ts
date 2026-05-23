'use server'

import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import {
  verifyPin,
  COOKIE_NAME,
  COOKIE_TTL_MS,
  buildPinCookie,
  verifyPinCookie,
} from '@/modules/auth/pin'
import { getSql } from '@/shared/db/client'
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
  await updateTenant(tenant.id, parsed.data)
  revalidatePath('/settings/facturacion')
  return { success: true }
}

export async function updateTenantSettingsAction(
  data: UpdateTenantSettingsInput,
  pinAttempt?: string,
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

  const cookieStore = cookies()
  const existingCookie = cookieStore.get(COOKIE_NAME)?.value
  if (!existingCookie || !verifyPinCookie(existingCookie)) {
    const pin = pinAttempt ?? headers().get('x-staff-pin') ?? null
    if (!pin) return { success: false, error: 'PIN_REQUIRED' }
    const sql = getSql()
    const rows = await sql<{ hash: string | null }[]>`
      SELECT settings->>'staff_pin_hash' AS hash
      FROM tenants WHERE id = ${tenant.id} LIMIT 1
    `
    const hash = rows[0]?.hash ?? null
    if (!hash) return { success: false, error: 'PIN_NOT_CONFIGURED' }
    const ok = await verifyPin(pin, hash)
    if (!ok) return { success: false, error: 'PIN_INVALID' }
    cookieStore.set({
      name: COOKIE_NAME,
      value: buildPinCookie(),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(COOKIE_TTL_MS / 1000),
      path: '/',
    })
  }

  await updateTenantSettings(tenant.id, parsed.data)
  revalidatePath('/settings/facturacion')
  return { success: true }
}
