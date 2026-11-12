import { createClient } from '@/lib/supabase/server'
import { captureException, captureMessage } from '@/lib/sentry'
import { getWorkerSql } from '@/shared/db/client'
import { revalidatePublicListings } from '@/shared/cache/public-listings'
import { track } from '@/shared/observability/breadcrumbs'
import { resolveStaffTenants, setStaffTenantClaim } from '@/modules/auth/auth.service'
import { referralCodeSchema } from '@/modules/referrals/referral.schema'
import { resolveSignupReferrer } from '@/modules/referrals/referral.service'
import { getStaffSignupReferral } from '@/modules/staff/staff.service'
import { horariosSchema } from '@/modules/tenants/opening-hours.schema'
import {
  completeOnboarding,
  createTenantWithTrial,
  getTenantById,
} from '@/modules/tenants/tenant.service'
import {
  buildUniformWeek,
  createOnboardingCourts,
  planWizardCourts,
  saveOnboardingProfile,
  saveOnboardingSchedule,
} from './onboarding.service'
import { signupDraftSchema, type SignupDraft } from './signup-draft.schema'

export type CreateComplexResult =
  | { ok: true; tenantId: string; slug: string; created: boolean }
  /** `tenantCreated`: ya existe el complejo (con dueño y trial) aunque haya quedado a medias. */
  | { ok: false; error: string; tenantCreated: boolean }

/**
 * Alta pública "complejo primero, cuenta al final": crea de una vez el complejo, el
 * horario, las canchas con sus precios y el perfil, y deja el onboarding cerrado.
 * Sirve igual para una cuenta de mail (recién creada) y para una de Google.
 *
 * Seguridad: `draft` es input no confiable (viene del `localStorage` del celular) y se
 * revalida acá adentro. `staffUserId`/`authUserId`/`email` los pone el servidor desde la
 * sesión, nunca el borrador. El borrador no puede apuntar a un complejo ajeno: el único
 * complejo que se crea o se retoma es el del propio `staffUserId`.
 *
 * Idempotente: si ese staff ya tiene complejo y está cerrado, lo devuelve sin tocar
 * nada. Si tiene uno sin cerrar (un intento anterior que cayó a medias), retoma los
 * pasos que faltan con el borrador, que son todos idempotentes (`saveOnboarding*`
 * pisan, `createOnboardingCourts` reutiliza las canchas por nombre).
 *
 * Qué se deshace y qué se reintenta. Todo lo que puede rechazar el alta se valida ANTES
 * de crear nada (borrador, coherencia canchas/precios, horario, plan de canchas), así
 * que un borrador malo no deja nada. Después:
 * - Falla `createTenantWithTrial`: no hay complejo (`tenantCreated: false`). El caller
 *   deshace la cuenta si la creó él, o reintenta (nada quedó para limpiar).
 * - Falla un paso posterior (horario, canchas, perfil, cierre): el complejo ya existe con
 *   su dueño y su trial y NO se borra (borrar en `tenants` arrastra cascadas y la FK de
 *   la membresía lo frena). Queda con `onboarding_completed = false` y el paso guardado:
 *   reintentar la action lo retoma, y si no, el wizard `/onboarding` sigue desde ahí.
 * Residual conocido: dos envíos simultáneos de la misma cuenta pueden crear dos
 * complejos (no hay lock: el pool puede ser de 1 conexión y un lock de sesión lo
 * trabaría); afecta solo al propio dueño.
 */
export async function createComplexFromDraft(params: {
  staffUserId: string
  authUserId: string
  email: string
  draft: unknown
}): Promise<CreateComplexResult> {
  const { staffUserId, authUserId, email } = params

  const parsed = signupDraftSchema.safeParse(params.draft)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Datos inválidos',
      tenantCreated: false,
    }
  }
  const draft = parsed.data

  const invalid = validateDraft(draft)
  if (!invalid.ok) return { ok: false, error: invalid.error, tenantCreated: false }
  const { openingHours, closesNextDay } = invalid

  const [existing] = await resolveStaffTenants(staffUserId)
  let tenantId: string
  let slug: string
  let created = false

  if (existing) {
    const tenant = await getTenantById(existing.tenantId)
    if (!tenant) return { ok: false, error: 'No encontramos tu complejo.', tenantCreated: false }
    if (tenant.settings.onboarding_completed === true) {
      return { ok: true, tenantId: tenant.id, slug: tenant.slug, created: false }
    }
    tenantId = tenant.id
    slug = tenant.slug
  } else {
    const newTenantId = crypto.randomUUID()
    try {
      const tenant = await createTenantWithTrial({
        id: newTenantId,
        staffUserId,
        name: draft.complex.name,
        address: draft.complex.address,
        city: draft.complex.city,
        province: draft.complex.province,
        phone: draft.phone,
        email,
        // Se cargan las dos o ninguna.
        latitude: draft.complex.longitude === null ? null : draft.complex.latitude,
        longitude: draft.complex.latitude === null ? null : draft.complex.longitude,
        referredByTenantId: await resolveReferrer(staffUserId, draft.referralCode, newTenantId),
      })
      tenantId = tenant.id
      slug = tenant.slug
      created = true
    } catch (err) {
      captureException(err, { tags: { flow: 'signup_create_tenant' }, extra: { staffUserId } })
      return { ok: false, error: 'No pudimos crear el complejo.', tenantCreated: false }
    }

    // Igual que `createTenantAction`: sin el claim, el JWT recién lo trae en el próximo
    // login. No es fatal: los guards resuelven el complejo por DB.
    try {
      await setStaffTenantClaim(authUserId, tenantId, staffUserId)
      await (await createClient()).auth.refreshSession()
    } catch (err) {
      captureMessage('createComplexFromDraft: no se pudo refrescar el claim', {
        level: 'warning',
        extra: { tenantId, error: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  try {
    await saveOnboardingSchedule(tenantId, openingHours, closesNextDay, 3)

    // Las canchas se planean sobre el horario ya guardado.
    const fresh = await getTenantById(tenantId)
    if (!fresh) throw new Error('El complejo no existe tras guardar el horario')
    const courtsResult = await createOnboardingCourts(fresh, draft.prices, 4)
    if (!courtsResult.success) throw new Error(courtsResult.error)

    await saveOnboardingProfile(tenantId, draft.profile, 5)
    await completeOnboarding(tenantId)
  } catch (err) {
    captureException(err, { tags: { flow: 'signup_finish_tenant' }, extra: { tenantId } })
    return {
      ok: false,
      error: 'No pudimos terminar de armar tu complejo.',
      tenantCreated: true,
    }
  }

  // El complejo pasa a ser visible en este instante (la búsqueda exige `onboarding_completed`).
  revalidatePublicListings()
  track.onboarding('onboarding.completed', {
    tenantId,
    courtsCount: draft.prices.formats.reduce((sum, f) => sum + f.count, 0),
  })
  return { ok: true, tenantId, slug, created }
}

/**
 * Alta con Google: Google no trae el celular, y su mail ya viene verificado. `staff_users`
 * es global (sin tenant todavía): pool de servicio. `emailVerified` lo decide el caller
 * mirando la identidad de Google, nunca el borrador; el `COALESCE` conserva la primera marca.
 */
export async function markGoogleOwnerProfile(
  staffUserId: string,
  phone: string,
  emailVerified: boolean,
): Promise<void> {
  await getWorkerSql()`
    UPDATE staff_users
    SET phone = ${phone},
        email_verified_at = CASE WHEN ${emailVerified} THEN COALESCE(email_verified_at, now()) ELSE email_verified_at END
    WHERE id = ${staffUserId}
  `
}

type DraftValidation =
  | { ok: false; error: string }
  | {
      ok: true
      openingHours: Parameters<typeof saveOnboardingSchedule>[1]
      closesNextDay: boolean
    }

/** Validaciones puras: nada se escribe hasta que todas pasen. */
export function validateDraft(draft: SignupDraft): DraftValidation {
  // Las canchas y los precios tienen que decir lo mismo: los precios crean las canchas.
  const counts = Object.entries(draft.courts)
  const sameShape =
    counts.length === draft.prices.formats.length &&
    counts.every(([format, count]) =>
      draft.prices.formats.some((f) => String(f.format) === format && f.count === count),
    )
  if (!sameShape) return { ok: false, error: 'Las canchas y los precios no coinciden.' }

  // Mismo camino que `saveWizardScheduleAction`: el schema canónico decide.
  const week = buildUniformWeek(draft.schedule.openHour, draft.schedule.closeHour)
  const hours = horariosSchema.safeParse({
    ...week.openingHours,
    closesNextDay: week.closesNextDay,
  })
  if (!hours.success)
    return { ok: false, error: hours.error.issues[0]?.message ?? 'Horarios inválidos.' }
  const { closesNextDay, ...openingHours } = hours.data

  const plan = planWizardCourts({ openingHours, closesNextDay }, draft.prices)
  if (!plan.ok) return { ok: false, error: plan.error }
  return { ok: true, openingHours, closesNextDay }
}

/**
 * Referidor del alta (B2). Un código roto o un error acá NUNCA frena el alta: se
 * crea el complejo sin referidor, igual que `createTenantAction`.
 */
async function resolveReferrer(
  staffUserId: string,
  draftCode: string | null | undefined,
  excludeTenantId: string,
): Promise<string | null> {
  try {
    const fromDraft =
      draftCode && referralCodeSchema.safeParse(draftCode).success ? draftCode : null
    const code =
      fromDraft ?? (await getStaffSignupReferral(staffUserId))?.signupReferralCode ?? null
    return await resolveSignupReferrer({ code, excludeTenantId })
  } catch (err) {
    captureMessage('createComplexFromDraft: no se pudo resolver el referidor', {
      level: 'warning',
      extra: { staffUserId, error: err instanceof Error ? err.message : String(err) },
    })
    return null
  }
}
