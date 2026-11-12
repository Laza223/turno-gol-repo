import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { isWizardComplete, resolveWizardStep } from '@/modules/onboarding/onboarding.service'
import { stepPath, SUMMARY_PATH } from '@/modules/onboarding/onboarding.steps'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

/**
 * `/onboarding` ya no renderiza: resuelve dónde quedó el dueño y manda al paso.
 * Los pasos viven en `/onboarding/[paso]`: cada uno con su URL, para que el botón
 * atrás del navegador funcione.
 *
 * Una sola query: antes preguntaba dos veces lo mismo (`resolveStaffTenants` para
 * saber si había tenant y después `getStaffTenant` para traerlo).
 */
export default async function OnboardingPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId, user.tenantId)
  if (!tenant) redirect(stepPath(1))

  const settings = tenant.settings as TenantSettings
  if (settings.onboarding_completed) redirect('/dashboard')

  // Con los 5 pasos hechos lo que falta es confirmar en el resumen.
  if (isWizardComplete(settings)) redirect(SUMMARY_PATH)
  redirect(stepPath(resolveWizardStep(settings)))
}
