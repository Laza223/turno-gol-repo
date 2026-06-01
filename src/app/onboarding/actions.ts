'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { setStaffTenantClaim } from '@/modules/auth/auth.service'
import {
  createTenantWithTrial,
  getStaffTenant,
  updateOnboardingStep,
  completeOnboarding,
  updateTenant,
} from '@/modules/tenants/tenant.service'
import { createTenantSchema } from '@/modules/tenants/tenant.schema'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

export type WizardActionResult = { success: true } | { success: false; error: string }

export async function createTenantAction(
  formData: FormData,
): Promise<WizardActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff') redirect('/login')
  if (!user.staffUserId) return { success: false, error: 'Staff ID no disponible' }

  const limited = await adminRateLimited(user.staffUserId)
  if (limited) return { success: false, error: limited }

  const raw = {
    name: formData.get('name'),
    address: formData.get('address'),
    city: formData.get('city'),
    province: formData.get('province'),
    phone: formData.get('phone') ?? user.email.split('@')[0],
    email: formData.get('email') ?? user.email,
  }

  const parsed = createTenantSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const tenant = await createTenantWithTrial({
    ...parsed.data,
    staffUserId: user.staffUserId,
  })

  try {
    await setStaffTenantClaim(user.id, tenant.id, user.staffUserId)
    const supabase = createClient()
    await supabase.auth.refreshSession()
  } catch {
    // Non-fatal: wizard continues. JWT will have tenant_id on next full login.
  }

  revalidatePath('/onboarding')
  return { success: true }
}

export async function advanceStepAction(nextStep: number): Promise<WizardActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    return { success: false, error: 'Sesión inválida' }
  }
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  await updateOnboardingStep(tenant.id, nextStep)
  revalidatePath('/onboarding')
  return { success: true }
}

export async function updateScheduleAction(
  openingHours: OpeningHours,
): Promise<WizardActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    return { success: false, error: 'Sesión inválida' }
  }
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  await updateTenant(tenant.id, { openingHours })
  await updateOnboardingStep(tenant.id, 3)
  revalidatePath('/onboarding')
  return { success: true }
}

export async function skipMpAction(): Promise<void> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    redirect('/login')
  }
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')
  await completeOnboarding(tenant.id)
  redirect('/dashboard')
}
