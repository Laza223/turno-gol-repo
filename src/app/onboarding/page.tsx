import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { resolveWizardStep } from '@/modules/onboarding/onboarding.service'
import { stepPath } from '@/modules/onboarding/onboarding.steps'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

/**
 * `/onboarding` ya no renderiza: resuelve dónde quedó el dueño y manda al paso.
 * Los pasos viven en `/onboarding/[paso]` — antes los cuatro compartían esta misma
 * URL, que es por lo que el botón atrás del navegador no hacía nada.
 *
 * Una sola query: antes preguntaba dos veces lo mismo (`resolveStaffTenants` para
 * saber si había tenant y después `getStaffTenant` para traerlo).
 */
export default async function OnboardingPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect(stepPath(1))

  const settings = tenant.settings as TenantSettings
  if (settings.onboarding_completed) redirect('/dashboard')

  redirect(stepPath(resolveWizardStep(settings)))
}
