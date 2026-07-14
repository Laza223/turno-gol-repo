'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { setStaffTenantClaim } from '@/modules/auth/auth.service'
import {
  createTenantWithTrial,
  getStaffTenant,
  updateOnboardingStep,
  completeOnboarding,
} from '@/modules/tenants/tenant.service'
import { createTenantSchema } from '@/modules/tenants/tenant.schema'
import {
  horariosFormDataToInput,
  horariosSchema,
} from '@/modules/tenants/opening-hours.schema'
import {
  createCourt,
  getCourtCountAndLimit,
  validatePricingRulesCoverage,
} from '@/modules/courts/court.service'
import { createCourtSchema } from '@/modules/courts/court.schema'
import { uniformRulesFromOpeningHours } from '@/modules/courts/pricing-grid'
import { withTenantContext } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { requireAdminStaff, requireAdminStaffAction } from '@/modules/staff/guards'

export type WizardActionResult = { success: true } | { success: false; error: string }

// caza-bugs #7: los pasos 2-4 del wizard (horarios, canchas, cerrar
// onboarding) son Configuración — solo-admin, igual que /settings y /canchas
// fuera del wizard. requireAdminStaffAction resuelve tenant+rol por DB
// (getStaffTenant + getStaffRole, NUNCA por el claim JWT), así que sigue
// funcionando aunque setStaffTenantClaim del Paso 1 todavía no haya
// propagado al JWT — no reintroduce el problema que este guard evitaba.

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
    const supabase = await createClient()
    await supabase.auth.refreshSession()
  } catch {
    // Non-fatal: wizard continues. JWT will have tenant_id on next full login.
  }

  revalidatePath('/onboarding')
  return { success: true }
}

/**
 * "Volver" de los pasos 3 y 4 (pages/onboarding.md §2). `completedStep` es el
 * último paso que queda como completado: la página muestra `completedStep + 1`.
 * Solo permite moverse dentro del wizard (1..3) — nunca completar ni saltear.
 */
export async function setWizardStepAction(completedStep: number): Promise<WizardActionResult> {
  if (!Number.isInteger(completedStep) || completedStep < 1 || completedStep > 3) {
    return { success: false, error: 'Paso inválido' }
  }
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const limited = await adminRateLimited(auth.tenant.id)
  if (limited) return { success: false, error: limited }

  await updateOnboardingStep(auth.tenant.id, completedStep)
  revalidatePath('/onboarding')
  return { success: true }
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
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Horarios inválidos.' }
  }

  // closesNextDay vive en su columna, NO dentro de opening_hours.
  const { closesNextDay, ...openingHours } = parsed.data

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({ openingHours, closesNextDay, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id))
  })

  await updateOnboardingStep(tenant.id, 2)
  revalidatePath('/onboarding')
  return { success: true }
}

// Paso 3 — drafts de canchas del wizard. El precio es UNO por cancha (modo
// uniforme, pages/onboarding.md §5); el ajuste por franja vive en /canchas.
const wizardCourtsSchema = z.object({
  courts: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Poné un nombre a cada cancha').max(100),
        format: z.number().int(),
        surfaceType: z.enum(['synthetic_grass', 'natural_grass', 'cement', 'tile']),
        isCovered: z.boolean(),
        priceCents: z
          .number()
          .int()
          .positive('Cargá el precio por turno de cada cancha'),
        photos: z.array(z.string()).optional(),
      }),
    )
    .max(20, 'Máximo 20 canchas por vez'),
})

export type WizardCourtDraftInput = z.infer<typeof wizardCourtsSchema>['courts'][number]

export async function createWizardCourtsAction(
  input: unknown,
): Promise<WizardActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsed = wizardCourtsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const drafts = parsed.data.courts

  // Validación completa por draft con el schema canónico de canchas (formato
  // 4..11, superficie, reglas de precio bien formadas).
  const inputs: z.infer<typeof createCourtSchema>[] = []
  for (const draft of drafts) {
    const rules = uniformRulesFromOpeningHours(
      tenant.openingHours,
      tenant.closesNextDay,
      draft.priceCents,
    )
    if (rules.length === 0) {
      return {
        success: false,
        error: 'Tus horarios no tienen días abiertos. Volvé al paso Horarios y abrí al menos un día.',
      }
    }
    const courtParsed = createCourtSchema.safeParse({
      name: draft.name,
      surfaceType: draft.surfaceType,
      isCovered: draft.isCovered,
      format: draft.format,
      pricing: { rules },
      photos: draft.photos,
    })
    if (!courtParsed.success) {
      return {
        success: false,
        error: courtParsed.error.issues[0]?.message ?? 'Datos inválidos',
      }
    }
    // Backstop de cobertura (mismo gate que /canchas): huecos = horas operativas
    // irreservables online.
    const coverage = validatePricingRulesCoverage(rules, tenant.openingHours)
    if (!coverage.valid) {
      const sample = coverage.gaps.slice(0, 3).map((g) => `${g.day} ${g.time}`).join(', ')
      return { success: false, error: `Precios sin cubrir: ${sample}` }
    }
    inputs.push(courtParsed.data)
  }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const { count, maxCourts } = await getCourtCountAndLimit(tenant.id, tx)
    // Continuar sin drafts es válido en una revisita ("Volver") si ya hay canchas.
    if (inputs.length === 0 && count === 0) {
      return { success: false as const, error: 'Agregá al menos una cancha para continuar.' }
    }
    if (maxCourts !== null && count + inputs.length > maxCourts) {
      return {
        success: false as const,
        error: `Tu plan soporta hasta ${maxCourts} canchas. Hacé upgrade para agregar más.`,
      }
    }
    for (const data of inputs) {
      await createCourt(tenant.id, data, tx)
    }
    return { success: true as const }
  })

  if (!result.success) return result

  await updateOnboardingStep(tenant.id, 3)
  revalidatePath('/onboarding')
  return { success: true }
}

/**
 * Paso 4 — "Sin seña por ahora" (o "Ir a mi complejo" con MP ya conectado).
 * Cierra el wizard y aterriza en el momento peak-end (/onboarding/listo), no en
 * un dashboard mudo. El camino "Sí, cobrar seña" termina en /api/mp/callback.
 */
export async function finishOnboardingAction(): Promise<void> {
  const { tenant } = await requireAdminStaff()
  await completeOnboarding(tenant.id)
  redirect('/onboarding/listo')
}

export type UploadPhotoActionResult = { success: true; url: string } | { success: false; error: string }

const MAX_PHOTO_BYTES = 2 * 1024 * 1024

export async function uploadOnboardingCourtPhotoAction(
  formData: FormData,
): Promise<UploadPhotoActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { isR2Configured, putImage, publicUrl } = await import('@/shared/storage/r2')

  if (!isR2Configured()) {
    console.warn('[storage] R2 no configurado — upload deshabilitado en este entorno')
    return { success: false, error: 'Storage no configurado en este entorno' }
  }

  const file = formData.get('file')
  if (!(file instanceof Blob) || file.size === 0) {
    return { success: false, error: 'Archivo inválido' }
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { success: false, error: 'La imagen no puede superar 2MB' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const key = `${tenant.id}/courts/draft/${crypto.randomUUID()}.webp`

  try {
    await putImage(key, bytes, 'image/webp')
  } catch {
    return { success: false, error: 'No se pudo subir la imagen' }
  }

  const url = publicUrl(key)
  return { success: true, url }
}

export async function deleteOnboardingCourtPhotoAction(url: string): Promise<WizardActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth
  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { isR2Configured, keyFromPublicUrl, deleteImage } = await import('@/shared/storage/r2')

  if (!isR2Configured()) {
    console.warn('[storage] R2 no configurado — borrado deshabilitado en este entorno')
    return { success: false, error: 'Storage no configurado en este entorno' }
  }

  const key = keyFromPublicUrl(url)
  if (!key || !key.startsWith(`${tenant.id}/`)) {
    return { success: false, error: 'Imagen inválida' }
  }

  try {
    await deleteImage(key)
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo borrar la imagen' }
  }
}
