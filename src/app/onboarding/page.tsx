import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveStaffTenants } from '@/modules/auth/auth.service'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { StepIdentity } from './components/StepIdentity'
import { StepCourts } from './components/StepCourts'
import { StepSchedule } from './components/StepSchedule'
import { StepPayments } from './components/StepPayments'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { Logo } from '@/components/ui/logo'

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo header */}
        <div className="mb-6 flex items-center justify-center">
          <Logo variant="horizontal" textClassName="text-slate-900" iconClassName="bg-white border-slate-200 shadow-sm" />
        </div>

        <div className="rounded-2xl bg-white shadow-md shadow-slate-200/60 border border-slate-200 p-8">
          {/* Stepper */}
          <div className="mb-8">
            <div className="flex justify-between text-xs font-medium text-slate-500 mb-3">
              <span>Paso {currentStep} de 4</span>
              <span className="tabular-nums text-emerald-700">{Math.round((currentStep / 4) * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={
                    n <= currentStep
                      ? 'flex-1 h-1 rounded-full bg-emerald-500'
                      : 'flex-1 h-1 rounded-full bg-slate-200'
                  }
                />
              ))}
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
    </div>
  )
}
