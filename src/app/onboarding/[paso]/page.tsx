import { notFound, redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { listCourts } from '@/modules/courts/court.service'
import {
  readDraftCounts,
  readDraftPrices,
  resolveWizardStep,
  wizardHoursFrom,
} from '@/modules/onboarding/onboarding.service'
import { WIZARD_FORMATS } from '@/modules/onboarding/onboarding.schema'
import { stepFromSlug, stepPath, WIZARD_STEPS } from '@/modules/onboarding/onboarding.steps'
import { withTenantContext } from '@/shared/db/client'
import { track } from '@/shared/observability/breadcrumbs'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { StepComplejo } from '../components/StepComplejo'
import { StepCanchas } from '../components/StepCanchas'
import { StepHorarios } from '../components/StepHorarios'
import { StepPrecios } from '../components/StepPrecios'
import { StepTuComplejo } from '../components/StepTuComplejo'
import {
  createTenantAction,
  saveWizardCourtsAction,
  saveWizardPricesAction,
  saveWizardProfileAction,
  saveWizardScheduleAction,
  updateWizardTenantAction,
} from '../actions'
// El buscador de dirección vive con el resto de la edición del perfil del
// complejo; el wizard consume la MISMA action para no tener dos copias.
import { geocodeAddressAction } from '@/app/(admin)/settings/perfil/actions'

/**
 * Un paso del wizard. La URL dice qué paso mostrar; la DB dice hasta dónde tiene
 * derecho a llegar.
 *
 * La regla es asimétrica a propósito: **atrás siempre se puede, adelante no**.
 * Revisitar un paso ya hecho es navegación legítima (el botón atrás del navegador,
 * "Atrás", "Cambiar" del resumen, un link pegado); saltear uno que todavía no
 * completó dejaría al wizard generando precios sobre horarios inexistentes. Pedir
 * un paso adelantado no es un error: es un redirect silencioso al primero que falta.
 */
export default async function OnboardingStepPage(props: { params: Promise<{ paso: string }> }) {
  const { paso } = await props.params

  const step = stepFromSlug(paso)
  if (step === null) notFound()

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId, user.tenantId)

  // Sin tenant solo existe el paso 1: es el que lo crea. Cualquier otro paso
  // renderizaría una card vacía.
  if (!tenant) {
    if (step !== 1) redirect(stepPath(1))
    // Único punto de emisión posible: acá no hay tenantId todavía. Se repite
    // por cada GET del paso 1 pre-tenant (reload, doble tab) — sobreconteo
    // aceptable, el embudo mide intención de arrancar, no sesiones únicas.
    track.onboarding('onboarding.started', {})
    return <StepComplejo action={createTenantAction} geocodeAction={geocodeAddressAction} />
  }

  const settings = tenant.settings as TenantSettings
  if (settings.onboarding_completed) redirect('/dashboard')

  const maxStep = resolveWizardStep(settings)
  if (step > maxStep) redirect(stepPath(maxStep))

  // Las canchas existentes alimentan Canchas y Precios (revisita y tenants del
  // wizard viejo, ver `resolveWizardStep`).
  const existingCourts =
    step === 2 || step === 4
      ? await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
      : []
  const counts = readDraftCounts(settings, existingCourts)
  // Precios sin nada que cobrar: el dueño todavía no eligió cuántas canchas tiene
  // (tenant del wizard viejo que había hecho Horarios pero no Canchas).
  const formatsToPrice = WIZARD_FORMATS.map((format) => ({
    format,
    count: counts[String(format)] ?? 0,
  })).filter((f) => f.count > 0)
  if (step === 4 && formatsToPrice.length === 0) redirect(stepPath(2))

  track.onboarding('onboarding.step.viewed', {
    tenantId: tenant.id,
    step,
    stepName: WIZARD_STEPS.find((s) => s.n === step)?.slug,
  })
  // Revisitar un paso anterior a `maxStep` es "Atrás" (link) o el botón atrás del
  // navegador — page.tsx no distingue cuál, y no hace falta: los dos significan lo
  // mismo para el embudo.
  if (step < maxStep) {
    track.onboarding('onboarding.step.back', { tenantId: tenant.id, step })
  }

  // Cada Step* arma su propio <StepScreen> (una pregunta por pantalla): el estado
  // de la pantalla vive adentro de cada componente, no acá (Server Component).
  // Este page.tsx solo decide CUÁL step renderizar y con qué datos.
  if (step === 1) {
    // Revisita del paso 1: el complejo ya existe, así que edita en vez de crear.
    return (
      <StepComplejo
        action={updateWizardTenantAction}
        geocodeAction={geocodeAddressAction}
        defaultValues={{
          name: tenant.name,
          address: tenant.address,
          city: tenant.city,
          province: tenant.province,
          slug: tenant.slug,
          latitude: tenant.latitude,
          longitude: tenant.longitude,
        }}
      />
    )
  }
  if (step === 2) {
    return <StepCanchas initialCounts={counts} action={saveWizardCourtsAction} />
  }
  if (step === 3) {
    const hours = wizardHoursFrom(tenant.openingHours)
    return (
      <StepHorarios
        initialOpenHour={hours.openHour}
        initialCloseHour={hours.closeHour}
        action={saveWizardScheduleAction}
      />
    )
  }
  if (step === 4) {
    return (
      <StepPrecios
        formats={formatsToPrice}
        initialPrices={readDraftPrices(settings, existingCourts)}
        initialCutHour={settings.onboarding_draft_cut_hour}
        action={saveWizardPricesAction}
      />
    )
  }
  return (
    <StepTuComplejo
      initial={{
        bookingIntake: settings.booking_intake,
        hasFixedTeams: settings.has_fixed_teams,
        canteenEnabled: settings.canteen_enabled,
      }}
      action={saveWizardProfileAction}
    />
  )
}
