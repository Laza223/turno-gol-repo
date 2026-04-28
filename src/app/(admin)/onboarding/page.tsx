import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveStaffTenants } from '@/modules/auth/auth.service'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { StepIdentity } from './components/StepIdentity'
import { StepCourts } from './components/StepCourts'
import { StepSchedule } from './components/StepSchedule'
import { StepPayments } from './components/StepPayments'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export default async function OnboardingPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff') redirect('/login')
  if (!user.staffUserId) redirect('/login')

  const staffTenants = await resolveStaffTenants(user.staffUserId)

  let currentStep = 1
  let tenantData = null

  if (staffTenants.length > 0) {
    tenantData = await getStaffTenant(user.staffUserId)
    if (tenantData) {
      const settings = tenantData.settings as TenantSettings
      if (settings.onboarding_completed) redirect('/dashboard')
      currentStep = (settings.onboarding_step ?? 1) + 1
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border p-8">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Paso {currentStep} de 4</span>
            <span>{Math.round((currentStep / 4) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full">
            <div
              className="h-1.5 bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        {currentStep === 1 && <StepIdentity />}
        {currentStep === 2 && <StepCourts />}
        {currentStep === 3 && tenantData && (
          <StepSchedule openingHours={tenantData.openingHours} />
        )}
        {currentStep === 4 && (
          <StepPayments mpConnected={!!tenantData?.mpConnectedAt} />
        )}
      </div>
    </div>
  )
}
