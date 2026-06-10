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
import { createTenantSchema, openingHoursSchema } from '@/modules/tenants/tenant.schema'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { z } from 'zod'

export type WizardActionResult = { success: true } | { success: false; error: string }

// #36: el wizard guardaba openingHours sin validar formato ni coherencia. Ademas
// del schema de formato (openingHoursSchema), exigimos cierre > apertura en cada
// dia abierto para no persistir horarios invertidos (apertura 22:00 / cierre 08:00).
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const scheduleSchema = openingHoursSchema.superRefine((hours, ctx) => {
  for (const [day, h] of Object.entries(hours)) {
    if (h.closed === true) continue
    if (hhmmToMinutes(h.close) <= hhmmToMinutes(h.open)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [day],
        message: 'El horario de cierre debe ser posterior al de apertura.',
      })
    }
  }
})

export async function createTenantAction(
  formData: FormData,
): Promise<WizardActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff') redirect('/login')
  if (!user.staffUserId) return { success: false, error: 'Staff ID no disponible' }

  const limited = await adminRateLimited(user.staffUserId)
  if (limited) return { success: false, error: limited }

  // #35: idempotencia. Si el staff ya tiene un tenant (ej. volvio con "atras" del
  // navegador y reenvio el Paso 1), no crear un duplicado ni una segunda fila en
  // tenant_staff_members: devolver success con el tenant existente.
  const existingTenant = await getStaffTenant(user.staffUserId)
  if (existingTenant) return { success: true }

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

  const parsed = scheduleSchema.safeParse(openingHours)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Horario inválido.' }
  }

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
