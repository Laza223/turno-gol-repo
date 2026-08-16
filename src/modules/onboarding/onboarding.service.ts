import { and, eq, isNull } from 'drizzle-orm'
import type { z } from 'zod'
import type { DbTx } from '@/shared/db/client'
import { withTenantContext } from '@/shared/db/client'
import { bookings, tenants } from '@/shared/db/schema'
import { updateOnboardingStep } from '@/modules/tenants/tenant.service'
import type { OpeningHours, TenantRow, TenantSettings } from '@/modules/tenants/tenant.types'
import {
  createCourt,
  getCourtCountAndLimit,
  listCourts,
  validatePricingRulesCoverage,
} from '@/modules/courts/court.service'
import { createCourtSchema } from '@/modules/courts/court.schema'
import { uniformRulesFromOpeningHours } from '@/modules/courts/pricing-grid'
import type { CourtRow } from '@/modules/courts/court.types'
import { createManualBooking, getAvailableSlots } from '@/modules/bookings/booking.service'
import {
  SlotTakenError,
  CourtOfflineError,
  PriceUnavailableError,
  BookingValidationError,
} from '@/modules/bookings/booking.errors'
import type { AvailableSlot } from '@/modules/bookings/booking.types'
import { artNowParts } from '@/shared/dates/art'
import { slotHasPassed } from '@/shared/time/operating-day'
import { DAY_KEYS } from '@/lib/booking/grid-cells'
import type { CreateFirstBookingResult, WizardActionResult, WizardStep } from './onboarding.types'
import { LAST_WIZARD_STEP } from './onboarding.types'
import type { WizardCourtDraftInput, WizardFirstBookingInput } from './onboarding.schema'

/**
 * Paso visible a partir de lo guardado en DB.
 *
 * `settings.onboarding_step` es el ÚLTIMO paso completado, no el actual: por eso
 * el +1. Un tenant recién creado (step 1 = identidad hecha) aterriza en Horarios.
 */
export function resolveWizardStep(settings: TenantSettings): WizardStep {
  const completed = settings.onboarding_step ?? 1
  return Math.min(completed + 1, LAST_WIZARD_STEP) as WizardStep
}

/**
 * Paso 2 — persistir horarios. `closesNextDay` va a su propia columna, NO adentro
 * del jsonb `opening_hours`: el motor de precios y los generadores de slots lo
 * leen de la columna.
 */
export async function saveOnboardingSchedule(
  tenantId: string,
  openingHours: OpeningHours,
  closesNextDay: boolean,
): Promise<void> {
  await withTenantContext(tenantId, async (tx) => {
    await tx
      .update(tenants)
      .set({ openingHours, closesNextDay, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
  })
  await updateOnboardingStep(tenantId, 2)
}

/**
 * Convierte los drafts del paso 3 en inputs validados de cancha, generando las
 * reglas de precio uniformes sobre los horarios YA confirmados en el paso 2.
 *
 * Es una función pura sobre el tenant: no toca la DB. Devuelve el primer error
 * legible que encuentre — el wizard muestra uno por vez, no una lista.
 */
export function buildCourtInputsFromDrafts(
  tenant: Pick<TenantRow, 'openingHours' | 'closesNextDay'>,
  drafts: readonly WizardCourtDraftInput[],
): { ok: true; inputs: z.infer<typeof createCourtSchema>[] } | { ok: false; error: string } {
  const inputs: z.infer<typeof createCourtSchema>[] = []

  for (const draft of drafts) {
    const rules = uniformRulesFromOpeningHours(
      tenant.openingHours,
      tenant.closesNextDay,
      draft.priceCents,
    )
    if (rules.length === 0) {
      return {
        ok: false,
        error:
          'Tus horarios no tienen días abiertos. Volvé al paso Horarios y abrí al menos un día.',
      }
    }

    const courtParsed = createCourtSchema.safeParse({
      name: draft.name,
      surfaceType: draft.surfaceType,
      isCovered: draft.isCovered,
      format: draft.format,
      pricing: { rules },
    })
    if (!courtParsed.success) {
      return { ok: false, error: courtParsed.error.issues[0]?.message ?? 'Datos inválidos' }
    }

    // Backstop de cobertura (mismo gate que /settings/canchas): un hueco entre
    // reglas es una hora operativa que nadie puede reservar online.
    const coverage = validatePricingRulesCoverage(rules, tenant.openingHours)
    if (!coverage.valid) {
      const sample = coverage.gaps
        .slice(0, 3)
        .map((g) => `${g.day} ${g.time}`)
        .join(', ')
      return { ok: false, error: `Precios sin cubrir: ${sample}` }
    }

    inputs.push(courtParsed.data)
  }

  return { ok: true, inputs }
}

/**
 * Paso 3 — crear las canchas y avanzar el wizard.
 *
 * Idempotente por nombre: volver con "Atrás" y reenviar, o un doble POST, dejaba
 * tres "Cancha 1" idénticas, todas `online` y reservables (🔴 QA 2026-08-13).
 * Saltear las que ya existen resiste el reenvío sin impedir que una revisita
 * agregue canchas nuevas.
 */
export async function createOnboardingCourts(
  tenant: Pick<TenantRow, 'id' | 'openingHours' | 'closesNextDay'>,
  drafts: readonly WizardCourtDraftInput[],
): Promise<WizardActionResult> {
  const built = buildCourtInputsFromDrafts(tenant, drafts)
  if (!built.ok) return { success: false, error: built.error }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const { count, maxCourts } = await getCourtCountAndLimit(tenant.id, tx)

    // Continuar sin drafts es válido en una revisita ("Volver") si ya hay canchas.
    if (built.inputs.length === 0 && count === 0) {
      return { success: false as const, error: 'Agregá al menos una cancha para continuar.' }
    }

    const existingNames = new Set(
      (await listCourts(tenant.id, tx)).map((c) => c.name.trim().toLocaleLowerCase('es')),
    )
    const toCreate = built.inputs.filter(
      (data) => !existingNames.has(data.name.trim().toLocaleLowerCase('es')),
    )

    if (maxCourts !== null && count + toCreate.length > maxCourts) {
      return {
        success: false as const,
        error: `Tu plan soporta hasta ${maxCourts} canchas. Hacé upgrade para agregar más.`,
      }
    }

    for (const data of toCreate) {
      await createCourt(tenant.id, data, tx)
    }
    return { success: true as const }
  })

  if (!result.success) return result

  await updateOnboardingStep(tenant.id, 3)
  return { success: true }
}

export type FirstBookingCourtSlots = { courtId: string; courtName: string; slots: AvailableSlot[] }

/**
 * Paso 4 — slots reales de HOY para las canchas ya creadas, para que el
 * dueño toque un horario y cargue su primer turno en la grilla de verdad
 * (§D del plan: es el único momento en que ya existen los tres requisitos
 * duros de `createManualBooking` — cancha online, precio y horario confirmados).
 *
 * Solo "hoy": es una previa liviana, no un selector de fecha (eso ya existe
 * en /reservas). Si hoy no queda ningún horario libre —cerrado, pasado, o ya
 * todo tomado— `courts[].slots` sale vacío y el paso muestra el estado vacío
 * en vez de fingir una grilla con horas que ya no se pueden tocar.
 */
export async function getFirstBookingSlots(
  tenant: Pick<TenantRow, 'id' | 'openingHours' | 'closesNextDay'>,
  existingCourts: readonly Pick<CourtRow, 'id' | 'name'>[],
  tx: DbTx,
): Promise<{ date: string; courts: FirstBookingCourtSlots[] }> {
  const { date, time } = artNowParts()
  const dayKey = DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!
  const openHhmm = tenant.openingHours[dayKey as keyof OpeningHours]?.open ?? '08:00'

  const courts: FirstBookingCourtSlots[] = []
  for (const court of existingCourts) {
    const raw = await getAvailableSlots(tenant.id, court.id, date, tx)
    const slots = raw.filter(
      (s) =>
        s.available &&
        !slotHasPassed({
          date,
          timeStart: s.timeStart,
          openHhmm,
          closesNextDay: tenant.closesNextDay,
          nowDate: date,
          nowTime: time,
        }),
    )
    courts.push({ courtId: court.id, courtName: court.name, slots })
  }
  return { date, courts }
}

/**
 * Crea la reserva manual del paso 4. Delgado alrededor de `createManualBooking`
 * (type `'spontaneous'`, `staffUserId` resuelto server-side por el guard —
 * nunca del cliente): la única razón de que exista es traducir sus excepciones
 * de dominio al mismo vocabulario de error que ya usa la grilla real
 * (`createBookingAction`, reservas/actions.ts), porque acá no hay grilla con
 * Realtime que la haga sobrar sola en un reintento.
 */
export async function createOnboardingFirstBooking(
  tenantId: string,
  staffUserId: string,
  input: WizardFirstBookingInput,
  tx: DbTx,
): Promise<CreateFirstBookingResult> {
  try {
    const created = await createManualBooking(
      tenantId,
      { ...input, type: 'spontaneous', staffUserId },
      tx,
    )
    return {
      success: true,
      booking: {
        courtId: created.courtId,
        timeStart: created.timeStart,
        timeEnd: created.timeEnd,
      },
    }
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return { success: false, error: 'Este turno acaba de ser tomado.' }
    }
    if (err instanceof CourtOfflineError) {
      return { success: false, error: 'La cancha no está disponible.' }
    }
    if (err instanceof PriceUnavailableError) {
      return { success: false, error: 'No hay precio configurado para este horario.' }
    }
    if (err instanceof BookingValidationError) {
      return { success: false, error: err.message }
    }
    throw err
  }
}

/**
 * ¿Ya existe alguna reserva para este tenant? Recién creado, un tenant no
 * tiene ninguna — así que "hay al menos una" en este punto del wizard solo
 * puede ser la que el propio dueño acaba de cargar en el paso 4. Se usa en
 * `/onboarding/listo` para el reconocimiento del cierre ("Tu primera reserva
 * ya está en la grilla"), sin necesitar una columna nueva que marque "esta
 * reserva la creó el wizard".
 */
export async function hasAnyBooking(tenantId: string): Promise<boolean> {
  return withTenantContext(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), isNull(bookings.canceledAt)))
      .limit(1)
    return rows.length > 0
  })
}
