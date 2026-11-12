'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { revalidatePublicListings } from '@/shared/cache/public-listings'
import { createClient } from '@/lib/supabase/server'
import { withTenantContext } from '@/shared/db/client'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { setStaffTenantClaim } from '@/modules/auth/auth.service'
import {
  createTenantWithTrial,
  getStaffTenant,
  completeOnboarding,
  updateTenant,
} from '@/modules/tenants/tenant.service'
import {
  createTenantWithLocationSchema,
  updateWizardIdentitySchema,
} from '@/modules/tenants/tenant.schema'
import { horariosSchema } from '@/modules/tenants/opening-hours.schema'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import {
  buildUniformWeek,
  createOnboardingCourts,
  isWizardComplete,
  resolveWizardStep,
  saveOnboardingCourtCounts,
  saveOnboardingProfile,
  saveOnboardingSchedule,
  stepToStore,
} from '@/modules/onboarding/onboarding.service'
import {
  wizardCourtCountsSchema,
  wizardPricesSchema,
  wizardProfileSchema,
  wizardScheduleSchema,
} from '@/modules/onboarding/onboarding.schema'
import { pathAfterStep, stepPath, WIZARD_STEPS } from '@/modules/onboarding/onboarding.steps'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { requireAdminStaff, requireAdminStaffAction } from '@/modules/staff/guards'
import { getStaffContact, getStaffSignupReferral } from '@/modules/staff/staff.service'
import { getCourtCountAndBilled } from '@/modules/courts/court.service'
import { track } from '@/shared/observability/breadcrumbs'
import { resolveSignupReferrer } from '@/modules/referrals/referral.service'
import { captureMessage } from '@/lib/sentry'

/** slug de WIZARD_STEPS por número, para el `stepName` de los eventos de analytics. */
function stepSlug(n: number): string | undefined {
  return WIZARD_STEPS.find((s) => s.n === n)?.slug
}

export type { WizardActionResult } from '@/modules/onboarding/onboarding.types'

import type { WizardActionResult } from '@/modules/onboarding/onboarding.types'

// caza-bugs #7: los pasos 2-5 del wizard (canchas, horarios, precios, tu complejo,
// cerrar onboarding) son Configuración — solo-admin, igual que /settings y /canchas
// fuera del wizard. requireAdminStaffAction resuelve tenant+rol por DB
// (getStaffTenant + getStaffRole), así que sigue funcionando aunque
// setStaffTenantClaim del Paso 1 todavía no haya propagado al JWT — no
// reintroduce el problema que este guard evitaba. AUD-01 le agregó a
// getStaffTenant el claim como PREFERENCIA, no como fuente: si falta, o
// apunta a un complejo sin membresía activa, cae igual a la membresía por DB.
// La preferencia importa acá por la impersonación del SuperAdmin, que entra
// al wizard con el staff_user_id de un admin proxy: sin ella, un proxy que
// además administra otro complejo más viejo resolvía ESE en las páginas del
// wizard, y el POST escribía sobre el impersonado con datos precargados del
// ajeno.

const WIZARD_CLOSED_ERROR = 'Tu complejo ya está abierto. Los cambios se hacen desde Ajustes.'

/** Con el onboarding cerrado, el wizard no escribe más: pisaría canchas y precios en producción. */
function wizardClosed(tenant: { settings: unknown }): boolean {
  return (tenant.settings as TenantSettings).onboarding_completed === true
}

export async function createTenantAction(
  _prevState: WizardActionResult,
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
  const existingTenant = await getStaffTenant(user.staffUserId, user.tenantId)
  if (existingTenant) return { success: true, next: stepPath(2), hardNavigate: true }

  // doc10 §2: el wizard NO pide teléfono/email del complejo — ya los pidió
  // `/register` para esta misma cuenta. Se derivan de ahí, no del form.
  const contact = await getStaffContact(user.staffUserId)
  if (!contact?.phone) {
    // Defensivo, no esperado en el camino normal: `/register` exige teléfono
    // con el mismo validador que este schema. Sin fallback inventado —
    // mismo espíritu que el fallback de `email.split('@')[0]` que se sacó de
    // acá por guardar "juan" como teléfono del complejo.
    return {
      success: false,
      error: 'Tu cuenta no tiene un teléfono cargado. Escribinos para completarlo.',
    }
  }

  const raw = {
    name: formData.get('name'),
    address: formData.get('address'),
    city: formData.get('city'),
    province: formData.get('province'),
    phone: contact.phone,
    email: contact.email,
    latitude: formData.get('latitude') ?? '',
    longitude: formData.get('longitude') ?? '',
  }

  const parsed = createTenantWithLocationSchema.safeParse(raw)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    track.onboarding('onboarding.step.error', { step: 1, stepName: stepSlug(1), reason: error })
    return { success: false, error }
  }

  // Programa de referidos (B2): resuelto ANTES del insert para poder pasarle
  // el UUID nuevo a `resolveSignupReferrer` (chequeo real de autoreferencia,
  // no solo el CHECK de la DB). Un error acá NUNCA frena el alta — se loguea
  // y el complejo se crea igual, sin referidor.
  const newTenantId = crypto.randomUUID()
  let referredByTenantId: string | null = null
  try {
    const signup = await getStaffSignupReferral(user.staffUserId)
    referredByTenantId = await resolveSignupReferrer({
      code: signup?.signupReferralCode ?? null,
      excludeTenantId: newTenantId,
    })
  } catch (err) {
    captureMessage('createTenantAction: no se pudo resolver el referidor', {
      level: 'warning',
      extra: {
        staffUserId: user.staffUserId,
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }

  const tenant = await createTenantWithTrial({
    ...parsed.data,
    id: newTenantId,
    staffUserId: user.staffUserId,
    referredByTenantId,
  })
  track.onboarding('onboarding.step.completed', {
    tenantId: tenant.id,
    step: 1,
    stepName: stepSlug(1),
  })

  try {
    await setStaffTenantClaim(user.id, tenant.id, user.staffUserId)
    const supabase = await createClient()
    await supabase.auth.refreshSession()
  } catch {
    // Non-fatal: wizard continues. JWT will have tenant_id on next full login.
  }

  // `hardNavigate`: este es el único paso que reescribe la cookie de sesión, y una
  // navegación client-side llegaría al paso 2 antes de que el browser la aplique
  // (misma carrera que el fix #158 de login en WebKit móvil). Recarga completa.
  return { success: true, next: stepPath(2), hardNavigate: true }
}

/**
 * Paso 1 en revisita — corregir los datos del complejo sin salir del wizard.
 *
 * **El slug NO se recalcula.** Se fija al crear el complejo: para cuando el
 * dueño vuelve a este paso el link público ya pudo viajar por WhatsApp, y
 * renombrar la cancha no puede romper un link que alguien tiene guardado.
 */
export async function updateWizardTenantAction(
  _prevState: WizardActionResult,
  formData: FormData,
): Promise<WizardActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  if (wizardClosed(tenant)) return { success: false, error: WIZARD_CLOSED_ERROR }

  // Sin phone/email: este paso no los pide (se editan en /settings/perfil,
  // ver tenantContactSchema). `updateTenant` hace SET parcial —omitirlos acá
  // no los toca en la fila.
  const parsed = updateWizardIdentitySchema.safeParse({
    name: formData.get('name'),
    address: formData.get('address'),
    city: formData.get('city'),
    province: formData.get('province'),
    latitude: formData.get('latitude') ?? '',
    longitude: formData.get('longitude') ?? '',
  })
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    track.onboarding('onboarding.step.error', {
      tenantId: tenant.id,
      step: 1,
      stepName: stepSlug(1),
      reason: error,
    })
    return { success: false, error }
  }

  await updateTenant(tenant.id, parsed.data)
  track.onboarding('onboarding.step.completed', {
    tenantId: tenant.id,
    step: 1,
    stepName: stepSlug(1),
  })
  revalidatePath('/onboarding', 'layout')
  const completed = (tenant.settings as TenantSettings).onboarding_step ?? 1
  return { success: true, next: pathAfterStep(1, completed) }
}

/** Paso 2 — Canchas: guarda cuántas hay de cada formato. Todavía no crea nada. */
export async function saveWizardCourtsAction(input: unknown): Promise<WizardActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  if (wizardClosed(tenant)) return { success: false, error: WIZARD_CLOSED_ERROR }

  const parsed = wizardCourtCountsSchema.safeParse(input)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    track.onboarding('onboarding.step.error', {
      tenantId: tenant.id,
      step: 2,
      stepName: stepSlug(2),
      reason: error,
    })
    return { success: false, error }
  }

  const settings = tenant.settings as TenantSettings
  await saveOnboardingCourtCounts(tenant.id, parsed.data, stepToStore(settings, 2))
  track.onboarding('onboarding.step.completed', {
    tenantId: tenant.id,
    step: 2,
    stepName: stepSlug(2),
  })
  revalidatePath('/onboarding', 'layout')
  return { success: true, next: pathAfterStep(2, settings.onboarding_step ?? 1) }
}

/**
 * Paso 3 — Horarios: el mismo horario los 7 días. Valida con el schema canónico
 * (`horariosSchema`, el mismo de /settings/horarios), que resuelve medianoche
 * '00:00', madrugada con `closesNextDay` y "al menos un día abierto".
 */
export async function saveWizardScheduleAction(input: unknown): Promise<WizardActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  if (wizardClosed(tenant)) return { success: false, error: WIZARD_CLOSED_ERROR }

  const hours = wizardScheduleSchema.safeParse(input)
  const week = hours.success ? buildUniformWeek(hours.data.openHour, hours.data.closeHour) : null
  const parsed = week
    ? horariosSchema.safeParse({ ...week.openingHours, closesNextDay: week.closesNextDay })
    : null
  if (!hours.success || !parsed || !parsed.success) {
    const error =
      (!hours.success ? hours.error.issues[0]?.message : parsed?.error?.issues[0]?.message) ??
      'Horarios inválidos.'
    track.onboarding('onboarding.step.error', {
      tenantId: tenant.id,
      step: 3,
      stepName: stepSlug(3),
      reason: error,
    })
    return { success: false, error }
  }

  // closesNextDay vive en su columna, NO dentro de opening_hours.
  const { closesNextDay, ...openingHours } = parsed.data
  const settings = tenant.settings as TenantSettings
  await saveOnboardingSchedule(tenant.id, openingHours, closesNextDay, stepToStore(settings, 3))
  track.onboarding('onboarding.step.completed', {
    tenantId: tenant.id,
    step: 3,
    stepName: stepSlug(3),
  })
  revalidatePath('/onboarding', 'layout')
  return { success: true, next: pathAfterStep(3, settings.onboarding_step ?? 1) }
}

/** Paso 4 — Precios: crea las canchas con sus precios. La lógica vive en el módulo. */
export async function saveWizardPricesAction(input: unknown): Promise<WizardActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  if (wizardClosed(tenant)) return { success: false, error: WIZARD_CLOSED_ERROR }

  const parsed = wizardPricesSchema.safeParse(input)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    track.onboarding('onboarding.step.error', {
      tenantId: tenant.id,
      step: 4,
      stepName: stepSlug(4),
      reason: error,
    })
    return { success: false, error }
  }

  const settings = tenant.settings as TenantSettings
  const result = await createOnboardingCourts(tenant, parsed.data, stepToStore(settings, 4))
  if (!result.success) {
    track.onboarding('onboarding.step.error', {
      tenantId: tenant.id,
      step: 4,
      stepName: stepSlug(4),
      reason: result.error,
    })
    return result
  }

  track.onboarding('onboarding.step.completed', {
    tenantId: tenant.id,
    step: 4,
    stepName: stepSlug(4),
  })
  // Aproximado: cuenta lo ENVIADO en este submit, no lo efectivamente creado
  // (reenviar reutiliza las canchas que ya existen). Suficiente para el embudo.
  track.onboarding('onboarding.courts.added', {
    tenantId: tenant.id,
    count: parsed.data.formats.reduce((sum, f) => sum + f.count, 0),
  })
  revalidatePath('/onboarding', 'layout')
  return { success: true, next: pathAfterStep(4, settings.onboarding_step ?? 1) }
}

/** Paso 5 — Tu complejo: cómo toma los turnos, equipos fijos y buffet. */
export async function saveWizardProfileAction(input: unknown): Promise<WizardActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  if (wizardClosed(tenant)) return { success: false, error: WIZARD_CLOSED_ERROR }

  const parsed = wizardProfileSchema.safeParse(input)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    track.onboarding('onboarding.step.error', {
      tenantId: tenant.id,
      step: 5,
      stepName: stepSlug(5),
      reason: error,
    })
    return { success: false, error }
  }

  const settings = tenant.settings as TenantSettings
  await saveOnboardingProfile(tenant.id, parsed.data, stepToStore(settings, 5))
  track.onboarding('onboarding.step.completed', {
    tenantId: tenant.id,
    step: 5,
    stepName: stepSlug(5),
  })
  revalidatePath('/onboarding', 'layout')
  return { success: true, next: pathAfterStep(5, settings.onboarding_step ?? 1) }
}

/**
 * "Terminar" en el resumen. Cierra el wizard y aterriza en el momento peak-end
 * (/onboarding/listo), no en un dashboard mudo. La primera reserva y la seña
 * (MercadoPago) pasaron a la checklist del panel.
 */
export async function finishOnboardingAction(): Promise<void> {
  const { tenant } = await requireAdminStaff()

  // Era la única action del archivo sin rate limit. El test de cobertura mira por
  // ARCHIVO, no por action, así que el hueco pasaba en verde. A diferencia de las
  // otras, esta no puede devolver el error: su contrato es `Promise<void>` y
  // termina en redirect. Rebotar al wizard es el equivalente honesto — el resumen
  // se vuelve a mostrar y el dueño reintenta.
  const limited = await adminRateLimited(tenant.id)
  if (limited) redirect('/onboarding')

  // Sin los 5 pasos hechos no hay nada que cerrar: el resumen solo se muestra
  // completo, pero la action se puede invocar sola.
  const settings = tenant.settings as TenantSettings
  if (!isWizardComplete(settings)) redirect(stepPath(resolveWizardStep(settings)))

  const { onlineCourts: courtsCount } = await withTenantContext(tenant.id, (tx) =>
    getCourtCountAndBilled(tenant.id, tx),
  )

  await completeOnboarding(tenant.id)
  // Este es el instante exacto en que el complejo pasa a ser visible: la
  // búsqueda pública exige `onboarding_completed`. Sin invalidar los tags,
  // `/explorar` y la home lo mostraban recién hasta 300 s después de que el
  // wizard ya le había dicho al dueño que había terminado.
  revalidatePublicListings()
  track.onboarding('onboarding.completed', { tenantId: tenant.id, courtsCount })
  redirect('/onboarding/listo')
}
