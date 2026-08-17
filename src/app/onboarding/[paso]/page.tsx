import { notFound, redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { listCourts } from '@/modules/courts/court.service'
import {
  getFirstBookingSlots,
  resolveWizardStep,
  type FirstBookingCourtSlots,
} from '@/modules/onboarding/onboarding.service'
import { stepFromSlug, stepPath, WIZARD_STEPS } from '@/modules/onboarding/onboarding.steps'
import { withTenantContext } from '@/shared/db/client'
import { track } from '@/shared/observability/breadcrumbs'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import type { CourtRow } from '@/modules/courts/court.types'
import { StepIdentity } from '../components/StepIdentity'
import { StepSchedule } from '../components/StepSchedule'
import { StepCourts } from '../components/StepCourts'
import { StepFirstBooking } from '../components/StepFirstBooking'
import {
  createOnboardingFirstBookingAction,
  createTenantAction,
  createWizardCourtsAction,
  finishOnboardingAction,
  saveWizardScheduleAction,
  updateWizardTenantAction,
} from '../actions'

/**
 * Un paso del wizard. La URL dice qué paso mostrar; la DB dice hasta dónde tiene
 * derecho a llegar.
 *
 * La regla es asimétrica a propósito: **atrás siempre se puede, adelante no**.
 * Revisitar un paso ya hecho es navegación legítima (el botón atrás, "Volver", un
 * link pegado); saltear uno que todavía no completó dejaría al wizard generando
 * precios sobre horarios inexistentes. Pedir un paso adelantado no es un error:
 * es un redirect silencioso al primero que falta.
 */
export default async function OnboardingStepPage(props: { params: Promise<{ paso: string }> }) {
  const { paso } = await props.params

  const step = stepFromSlug(paso)
  if (step === null) notFound()

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)

  // Sin tenant solo existe el paso 1: es el que lo crea. Cualquier otro paso
  // renderizaría una card vacía — antes lo hacía, literalmente.
  if (!tenant) {
    if (step !== 1) redirect(stepPath(1))
    // Único punto de emisión posible: acá no hay tenantId todavía. Se repite
    // por cada GET del paso 1 pre-tenant (reload, doble tab) — sobreconteo
    // aceptable, el embudo mide intención de arrancar, no sesiones únicas.
    track.onboarding('onboarding.started', {})
    return <StepIdentity action={createTenantAction} />
  }

  const settings = tenant.settings as TenantSettings
  if (settings.onboarding_completed) redirect('/dashboard')

  const maxStep = resolveWizardStep(settings)
  if (step > maxStep) redirect(stepPath(maxStep))

  track.onboarding('onboarding.step.viewed', {
    tenantId: tenant.id,
    step,
    stepName: WIZARD_STEPS.find((s) => s.n === step)?.slug,
  })
  // Revisitar un paso anterior a `maxStep` es "Volver" (link) o el botón atrás
  // del navegador — page.tsx no distingue cuál, y no hace falta: los dos
  // significan lo mismo para el embudo.
  if (step < maxStep) {
    track.onboarding('onboarding.step.back', { tenantId: tenant.id, step })
  }

  let existingCourts: CourtRow[] = []
  let firstBookingSlots: { date: string; courts: FirstBookingCourtSlots[] } | null = null
  if (step === 3) {
    existingCourts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
  }
  if (step === 4) {
    // El paso 4 necesita las canchas Y sus slots de hoy en la MISMA
    // transacción: `getFirstBookingSlots` lee `getAvailableSlots` por cancha,
    // que ya asume un `tx` con el contexto de tenant puesto (RLS).
    firstBookingSlots = await withTenantContext(tenant.id, async (tx) => {
      const courts = await listCourts(tenant.id, tx)
      return getFirstBookingSlots(tenant, courts, tx)
    })
  }

  // Cada Step* arma su propio <WizardShell> (rail + preview del producto): el
  // preview necesita el estado local del paso —lo que se está tipeando—, que
  // vive adentro de cada componente, no acá (Server Component). Este page.tsx
  // solo decide CUÁL step renderizar.
  return (
    <>
      {/* Revisita del paso 1: el complejo ya existe, así que el form edita en vez
          de crear. Antes rebotaba al paso pendiente y un nombre mal tipeado no
          tenía arreglo — el wizard es la única pantalla que pide estos campos. */}
      {step === 1 && (
        <StepIdentity
          action={updateWizardTenantAction}
          defaultValues={{
            name: tenant.name,
            address: tenant.address,
            city: tenant.city,
            province: tenant.province,
            slug: tenant.slug,
          }}
        />
      )}
      {step === 2 && (
        <StepSchedule
          hours={tenant.openingHours}
          closesNextDay={tenant.closesNextDay}
          action={saveWizardScheduleAction}
        />
      )}
      {step === 3 && (
        <StepCourts
          existingCourts={existingCourts}
          tenantId={tenant.id}
          createCourtsAction={createWizardCourtsAction}
        />
      )}
      {step === 4 && firstBookingSlots && (
        <StepFirstBooking
          date={firstBookingSlots.date}
          courts={firstBookingSlots.courts}
          action={createOnboardingFirstBookingAction}
          finishAction={finishOnboardingAction}
        />
      )}
    </>
  )
}
