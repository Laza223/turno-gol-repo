import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveStaffTenants } from '@/modules/auth/auth.service'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { listCourts } from '@/modules/courts/court.service'
import { withTenantContext } from '@/shared/db/client'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import type { CourtRow } from '@/modules/courts/court.types'
import { WizardShell } from './components/WizardShell'
import { StepIdentity } from './components/StepIdentity'
import { StepSchedule } from './components/StepSchedule'
import { StepCourts } from './components/StepCourts'
import { StepPayments } from './components/StepPayments'
import {
  createTenantAction,
  createWizardCourtsAction,
  deleteOnboardingCourtPhotoAction,
  finishOnboardingAction,
  saveWizardScheduleAction,
  setWizardStepAction,
  uploadOnboardingCourtPhotoAction,
} from './actions'

export default async function OnboardingPage(
  props: {
    searchParams?: Promise<{ error?: string }>
  }
) {
  const searchParams = await props.searchParams;
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
      currentStep = Math.min((settings.onboarding_step ?? 1) + 1, 4)
    }
  }

  // El paso Canchas lista las ya creadas (revisita con "Volver"): permite
  // continuar sin drafts nuevos y evita duplicados por doble envío.
  let existingCourts: CourtRow[] = []
  if (currentStep === 3 && tenantData) {
    const tenantId = tenantData.id
    existingCourts = await withTenantContext(tenantId, (tx) => listCourts(tenantId, tx))
  }

  return (
    <WizardShell currentStep={currentStep} wide={currentStep === 2 || currentStep === 3}>
      <div className="card-premium rounded-2xl p-6 md:p-8">
        {currentStep === 1 && <StepIdentity action={createTenantAction} />}
        {currentStep === 2 && tenantData && (
          <StepSchedule
            hours={tenantData.openingHours}
            closesNextDay={tenantData.closesNextDay}
            action={saveWizardScheduleAction}
          />
        )}
        {currentStep === 3 && tenantData && (
          <StepCourts
            existingCourts={existingCourts}
            createCourtsAction={createWizardCourtsAction}
            setStepAction={setWizardStepAction}
            uploadPhotoAction={uploadOnboardingCourtPhotoAction}
            deletePhotoAction={deleteOnboardingCourtPhotoAction}
          />
        )}
        {currentStep === 4 && tenantData && (
          <StepPayments
            mpConnected={!!tenantData.mpConnectedAt}
            mpError={searchParams?.error ?? null}
            finishAction={finishOnboardingAction}
            setStepAction={setWizardStepAction}
          />
        )}
      </div>
    </WizardShell>
  )
}
