'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
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
import { createTenantSchema, updateTenantIdentitySchema } from '@/modules/tenants/tenant.schema'
import { horariosFormDataToInput, horariosSchema } from '@/modules/tenants/opening-hours.schema'
import {
  createOnboardingCourts,
  createOnboardingFirstBooking,
  hasAnyBooking,
  saveOnboardingSchedule,
} from '@/modules/onboarding/onboarding.service'
import {
  wizardCourtsSchema,
  wizardFirstBookingSchema,
} from '@/modules/onboarding/onboarding.schema'
import { stepPath, WIZARD_STEPS } from '@/modules/onboarding/onboarding.steps'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { requireAdminStaff, requireAdminStaffAction } from '@/modules/staff/guards'
import { getStaffContact } from '@/modules/staff/staff.service'
import { getCourtCountAndLimit } from '@/modules/courts/court.service'
import { track } from '@/shared/observability/breadcrumbs'

/** slug de WIZARD_STEPS por número, para el `stepName` de los eventos de analytics. */
function stepSlug(n: number): string | undefined {
  return WIZARD_STEPS.find((s) => s.n === n)?.slug
}

export type { WizardActionResult } from '@/modules/onboarding/onboarding.types'
export type { WizardCourtDraftInput } from '@/modules/onboarding/onboarding.schema'

import type {
  CreateFirstBookingResult,
  WizardActionResult,
} from '@/modules/onboarding/onboarding.types'

// caza-bugs #7: los pasos 2-4 del wizard (horarios, canchas, cerrar
// onboarding) son Configuración — solo-admin, igual que /settings y /canchas
// fuera del wizard. requireAdminStaffAction resuelve tenant+rol por DB
// (getStaffTenant + getStaffRole, NUNCA por el claim JWT), así que sigue
// funcionando aunque setStaffTenantClaim del Paso 1 todavía no haya
// propagado al JWT — no reintroduce el problema que este guard evitaba.

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
  const existingTenant = await getStaffTenant(user.staffUserId)
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
  }

  const parsed = createTenantSchema.safeParse(raw)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    track.onboarding('onboarding.step.error', { step: 1, stepName: stepSlug(1), reason: error })
    return { success: false, error }
  }

  const tenant = await createTenantWithTrial({
    ...parsed.data,
    staffUserId: user.staffUserId,
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
 * Existe porque el paso 2 ahora tiene "Volver" y ese botón necesita un destino
 * real: hasta acá el paso 1 rebotaba al paso pendiente, así que un nombre mal
 * tipeado no se podía arreglar hasta terminar todo el onboarding (y después
 * tampoco — no hay pantalla de Configuración que edite estos campos).
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

  // Sin phone/email: este paso ya no los pide (se editan en /settings/perfil,
  // ver tenantContactSchema). `updateTenant` hace SET parcial —omitirlos acá
  // no los toca en la fila.
  const parsed = updateTenantIdentitySchema.safeParse({
    name: formData.get('name'),
    address: formData.get('address'),
    city: formData.get('city'),
    province: formData.get('province'),
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
  return { success: true, next: stepPath(2) }
}

/**
 * Paso 2 — Horarios. Mismo contrato FormData y mismo schema canónico que
 * /settings/horarios (horariosSchema resuelve medianoche '00:00', madrugada con
 * closesNextDay, días cerrados y "al menos un día abierto"). Muere el
 * scheduleSchema local que rechazaba los propios defaults (cierre 00:00).
 */
export async function saveWizardScheduleAction(
  _prevState: WizardActionResult,
  formData: FormData,
): Promise<WizardActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsed = horariosSchema.safeParse(horariosFormDataToInput(formData))
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Horarios inválidos.'
    track.onboarding('onboarding.step.error', {
      tenantId: tenant.id,
      step: 2,
      stepName: stepSlug(2),
      reason: error,
    })
    return { success: false, error }
  }

  // closesNextDay vive en su columna, NO dentro de opening_hours.
  const { closesNextDay, ...openingHours } = parsed.data

  await saveOnboardingSchedule(tenant.id, openingHours, closesNextDay)
  track.onboarding('onboarding.step.completed', {
    tenantId: tenant.id,
    step: 2,
    stepName: stepSlug(2),
  })
  revalidatePath('/onboarding', 'layout')
  return { success: true, next: stepPath(3) }
}

/** Paso 3 — canchas y precios. La lógica vive en el módulo; acá solo el borde. */
export async function createWizardCourtsAction(input: unknown): Promise<WizardActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsed = wizardCourtsSchema.safeParse(input)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    track.onboarding('onboarding.step.error', {
      tenantId: tenant.id,
      step: 3,
      stepName: stepSlug(3),
      reason: error,
    })
    return { success: false, error }
  }

  const result = await createOnboardingCourts(tenant, parsed.data.courts)
  if (!result.success) {
    track.onboarding('onboarding.step.error', {
      tenantId: tenant.id,
      step: 3,
      stepName: stepSlug(3),
      reason: result.error,
    })
    return result
  }

  track.onboarding('onboarding.step.completed', {
    tenantId: tenant.id,
    step: 3,
    stepName: stepSlug(3),
  })
  if (parsed.data.courts.length > 0) {
    // Aproximado: cuenta lo ENVIADO en este submit, no lo efectivamente creado
    // (createOnboardingCourts saltea duplicados por nombre en un reenvío —
    // caza-bugs #7). Suficiente para el embudo; el caso de reenvío es raro.
    track.onboarding('onboarding.courts.added', {
      tenantId: tenant.id,
      count: parsed.data.courts.length,
    })
  }
  revalidatePath('/onboarding', 'layout')
  return { success: true, next: stepPath(4) }
}

/**
 * Paso 4 — cargar la primera reserva. Nunca navega (el turno aparece inline
 * en la grilla del propio paso, ver StepFirstBooking): por eso el contrato es
 * `CreateFirstBookingResult`, no `WizardActionResult`. Sigue el paso hasta el
 * final en 2 y 3 no marca `onboarding_step`: es skippable siempre (§D del
 * plan), así que no hay "completado" que trackear acá — cerrar el wizard es
 * `finishOnboardingAction`, con o sin turno cargado.
 */
export async function createOnboardingFirstBookingAction(
  input: unknown,
): Promise<CreateFirstBookingResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsed = wizardFirstBookingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const result = await withTenantContext(tenant.id, (tx) =>
    createOnboardingFirstBooking(tenant.id, user.staffUserId, parsed.data, tx),
  )
  if (!result.success) {
    // Sin `onboarding.step.error` acá: no navega ni bloquea nada (el paso es
    // skippable), así que un slot recién tomado no es un tropiezo del embudo —
    // el mini-form ya lo maneja mostrando el error inline.
    return result
  }

  track.onboarding('onboarding.first_booking.created', { tenantId: tenant.id })
  revalidatePath('/onboarding', 'layout')
  return result
}

/**
 * Paso 4 — "Terminar y ver mi complejo" (con o sin turno cargado) o "Saltar
 * por ahora". Cierra el wizard y aterriza en el momento peak-end
 * (/onboarding/listo), no en un dashboard mudo. La seña (MercadoPago) ya no
 * se decide acá — se movió a la checklist del dashboard (§D del plan, Fase 5):
 * conectarla es /api/mp/oauth-start desde /settings/facturacion, fuera del wizard.
 */
export async function finishOnboardingAction(): Promise<void> {
  const { tenant } = await requireAdminStaff()

  // Era la única action del archivo sin rate limit. El test de cobertura mira por
  // ARCHIVO, no por action, así que el hueco pasaba en verde. A diferencia de las
  // otras, esta no puede devolver el error: su contrato es `Promise<void>` y
  // termina en redirect. Rebotar al wizard es el equivalente honesto — el paso 4
  // se vuelve a mostrar y el dueño reintenta.
  const limited = await adminRateLimited(tenant.id)
  if (limited) redirect('/onboarding')

  // Un tenant recién creado no tiene reservas propias todavía: si hay al menos
  // una, solo puede ser la que el propio dueño cargó en el paso 4 (mismo
  // razonamiento que /onboarding/listo). `first_booking.created` ya se emitió
  // en ese momento (createOnboardingFirstBookingAction) — acá solo hace falta
  // el caso contrario, que no tiene ningún otro punto de emisión posible.
  const [hasFirstBooking, { count: courtsCount }] = await Promise.all([
    hasAnyBooking(tenant.id),
    withTenantContext(tenant.id, (tx) => getCourtCountAndLimit(tenant.id, tx)),
  ])
  if (!hasFirstBooking) {
    track.onboarding('onboarding.first_booking.skipped', { tenantId: tenant.id })
  }

  await completeOnboarding(tenant.id)
  track.onboarding('onboarding.completed', { tenantId: tenant.id, courtsCount, hasFirstBooking })
  redirect('/onboarding/listo')
}

// Acá vivían `uploadOnboardingCourtPhotoAction` y `deleteOnboardingCourtPhotoAction`.
// El uploader del paso 3 subía a `${tenantId}/courts/draft/…` y el submit armaba
// el payload SIN el campo `photos`: la cancha se creaba sin foto y el objeto
// quedaba huérfano en R2 para siempre. La foto no bloquea recibir reservas, y
// `/settings/canchas` ya tiene el mismo uploader contra la cancha real — así que
// el paso 3 la deja de pedir en vez de arrastrar dos actions para perder el
// archivo. Los objetos ya subidos bajo ese prefijo quedan en el bucket: R2 no
// tiene barrido y el prefijo es inerte (nadie lo lee ni lo vuelve a escribir).
