import type { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import { abonados, bookings, courts, tenants } from '@/shared/db/schema'
import { updateTenantSettings } from '@/modules/tenants/tenant.service'
import type {
  OpeningHours,
  OpeningHoursDay,
  TenantRow,
  TenantSettings,
} from '@/modules/tenants/tenant.types'
import { DAY_KEYS, type DayKey } from '@/shared/time/week-days'
import {
  createCourt,
  getCourtCountAndBilled,
  listCourts,
  toggleStatus,
  updateCourt,
  validatePricingRulesCoverage,
} from '@/modules/courts/court.service'
import { changeBilledCourts } from '@/modules/billing/billing.service'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { createCourtSchema } from '@/modules/courts/court.schema'
import {
  dayNightRulesFromOpeningHours,
  mostFrequentRulePrice,
  uniformRulesFromOpeningHours,
} from '@/modules/courts/pricing-grid'
import type { CourtRow, PricingRule } from '@/modules/courts/court.types'
import type { WizardActionResult, WizardStep } from './onboarding.types'
import { LAST_WIZARD_STEP } from './onboarding.types'
import {
  DEFAULT_CUT_HOUR,
  WIZARD_FORMATS,
  wizardScheduleSchema,
  type WizardPricesInput,
  type WizardProfileInput,
} from './onboarding.schema'

/**
 * Paso visible a partir de lo guardado en DB.
 *
 * `settings.onboarding_step` es el ÚLTIMO paso completado, no el actual: por eso
 * el +1. Un tenant recién creado (step 1 = complejo hecho) aterriza en Canchas, y
 * el alta asistida (`createAssistedTenant`, `onboarding_step: 1`) también.
 *
 * Tenants que estaban a mitad del wizard VIEJO (1 complejo, 2 horarios, 3 canchas,
 * 4 reserva): el valor guardado se reinterpreta con el orden nuevo
 * (1 complejo, 2 canchas, 3 horarios, 4 precios, 5 tu-complejo).
 * - step 1: sin cambios, cae en Canchas.
 * - step 2 (tenía horarios, sin canchas): cae en Horarios y los ve ya cargados.
 *   Como no hay borrador de canchas, Precios lo manda a Canchas
 *   (`[paso]/page.tsx`) y recién ahí elige cuántas.
 * Cambiar Canchas u Horarios BAJA el paso guardado a ese paso (`stepToStore`): los
 * precios dependen de la cantidad y del horario, así que Precios vuelve a ser
 * obligatorio y el resumen no se abre hasta repasarlo.
 *
 * - step 3 (tenía canchas creadas): cae en Precios. Sin borrador, la cantidad por
 *   formato se deduce de las canchas que ya existen (`readDraftCounts`) y los
 *   precios de sus reglas (`readDraftPrices`). Al guardar, `createOnboardingCourts`
 *   reutiliza esas canchas (por nombre y, si no coincide, por orden) en vez de
 *   duplicarlas.
 */
export function resolveWizardStep(settings: TenantSettings): WizardStep {
  const completed = settings.onboarding_step ?? 1
  return Math.min(completed + 1, LAST_WIZARD_STEP) as WizardStep
}

/** ¿Hizo los 5 pasos? Es la puerta de `/onboarding/resumen`. */
export function isWizardComplete(settings: TenantSettings): boolean {
  return (settings.onboarding_step ?? 1) >= LAST_WIZARD_STEP
}

/**
 * Paso a guardar al terminar el paso `n`. Complejo, Precios y Tu complejo nunca
 * bajan: volver con "Cambiar" y reenviar no obliga a repetir los siguientes.
 * Canchas (2) y Horarios (3) sí bajan al propio paso: cambian la cantidad o el
 * horario, y los precios ya cargados dejan de valer hasta repasarlos.
 */
export function stepToStore(settings: TenantSettings, n: number): number {
  if (n === 2 || n === 3) return n
  return Math.max(settings.onboarding_step ?? 1, n)
}

/** Paso Canchas: guarda la cantidad por formato. Todavía no crea canchas. */
export async function saveOnboardingCourtCounts(
  tenantId: string,
  counts: Record<string, number>,
  step: number,
): Promise<void> {
  await updateTenantSettings(tenantId, { onboarding_draft_courts: counts, onboarding_step: step })
}

/**
 * Paso Horarios: persistir. `closesNextDay` va a su propia columna, NO adentro
 * del jsonb `opening_hours`: el motor de precios y los generadores de slots lo
 * leen de la columna.
 */
export async function saveOnboardingSchedule(
  tenantId: string,
  openingHours: OpeningHours,
  closesNextDay: boolean,
  step: number,
): Promise<void> {
  await withTenantContext(tenantId, async (tx) => {
    await tx
      .update(tenants)
      .set({ openingHours, closesNextDay, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
  })
  await updateTenantSettings(tenantId, { onboarding_step: step })
}

const DEFAULT_OPEN_HOUR = 8
const DEFAULT_CLOSE_HOUR = 0

const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/**
 * El mismo horario los 7 días, de hora entera. `closeHour` 0 es medianoche; un
 * cierre que no es posterior a la apertura (1 a 4) cae en la madrugada del día
 * siguiente y prende `closesNextDay`. La validez final la decide `horariosSchema`.
 */
export function buildUniformWeek(
  openHour: number,
  closeHour: number,
): { openingHours: Record<DayKey, OpeningHoursDay>; closesNextDay: boolean } {
  const day: OpeningHoursDay = { open: hh(openHour), close: hh(closeHour), closed: false }
  const openingHours = {} as Record<DayKey, OpeningHoursDay>
  for (const key of DAY_KEYS) openingHours[key] = { ...day }
  return { openingHours, closesNextDay: closeHour !== 0 && closeHour <= openHour }
}

/**
 * Horas que muestra el paso Horarios: las del primer día abierto del complejo, o
 * 08 a 00 si no se pueden expresar con un solo par de horas enteras.
 */
export function wizardHoursFrom(openingHours: OpeningHours): {
  openHour: number
  closeHour: number
} {
  const fallback = { openHour: DEFAULT_OPEN_HOUR, closeHour: DEFAULT_CLOSE_HOUR }
  const first = DAY_KEYS.map((k) => openingHours[k]).find((d) => d && !d.closed)
  if (!first) return fallback
  const openHour = Number(first.open.slice(0, 2))
  const closeHour = Number(first.close.slice(0, 2))
  if (!first.open.endsWith(':00') || !first.close.endsWith(':00')) return fallback
  if (!Number.isInteger(openHour) || !Number.isInteger(closeHour)) return fallback
  if (!wizardScheduleSchema.safeParse({ openHour, closeHour }).success) return fallback
  return { openHour, closeHour }
}

/** Paso Tu complejo: guarda las tres respuestas. */
export async function saveOnboardingProfile(
  tenantId: string,
  profile: WizardProfileInput,
  step: number,
): Promise<void> {
  await updateTenantSettings(tenantId, {
    booking_intake: profile.bookingIntake,
    has_fixed_teams: profile.hasFixedTeams,
    canteen_enabled: profile.canteenEnabled,
    onboarding_step: step,
  })
}

/** Cantidad de canchas por formato: el borrador, o lo que ya existe si no hay. */
export function readDraftCounts(
  settings: TenantSettings,
  courts: readonly Pick<CourtRow, 'format'>[],
): Record<string, number> {
  if (settings.onboarding_draft_courts) return settings.onboarding_draft_courts
  const counts: Record<string, number> = {}
  for (const c of courts) {
    if (!(WIZARD_FORMATS as readonly number[]).includes(c.format)) continue
    counts[String(c.format)] = (counts[String(c.format)] ?? 0) + 1
  }
  return counts
}

type DraftPrices = Record<string, { dayPrice: number; nightPrice?: number }>

/** Precios por formato: el borrador, o lo deducido de las reglas de la primera cancha de cada formato. */
export function readDraftPrices(
  settings: TenantSettings,
  courts: readonly Pick<CourtRow, 'format' | 'pricing'>[],
): DraftPrices {
  if (settings.onboarding_draft_prices) return settings.onboarding_draft_prices
  const out: DraftPrices = {}
  for (const c of courts) {
    const key = String(c.format)
    if (out[key]) continue
    const price = mostFrequentRulePrice(c.pricing.rules)
    if (price != null) out[key] = { dayPrice: price }
  }
  return out
}

type PlannedCourt = { name: string; format: number; rules: PricingRule[] }

function hasNightPrice(f: { dayPrice: number; nightPrice?: number }): boolean {
  return f.nightPrice !== undefined && f.nightPrice !== f.dayPrice
}

/**
 * Canchas a crear a partir de los precios cargados: "Cancha 1…N" numeradas en todo
 * el complejo (formatos de menor a mayor) y reglas sobre los horarios YA
 * confirmados. Pura: no toca la DB. Con precio de noche distinto, parte el día en
 * el corte; si no, un precio uniforme.
 */
export function planWizardCourts(
  tenant: Pick<TenantRow, 'openingHours' | 'closesNextDay'>,
  input: WizardPricesInput,
): { ok: true; courts: PlannedCourt[] } | { ok: false; error: string } {
  const courts: PlannedCourt[] = []
  const cutHhmm = `${String(input.cutHour ?? DEFAULT_CUT_HOUR).padStart(2, '0')}:00`
  const formats = [...input.formats].sort((a, b) => a.format - b.format)

  for (const row of formats) {
    const rules =
      row.nightPrice !== undefined && hasNightPrice(row)
        ? dayNightRulesFromOpeningHours(
            tenant.openingHours,
            tenant.closesNextDay,
            row.dayPrice,
            row.nightPrice,
            cutHhmm,
          )
        : uniformRulesFromOpeningHours(tenant.openingHours, tenant.closesNextDay, row.dayPrice)
    if (rules.length === 0) {
      return {
        ok: false,
        error:
          'Tus horarios no tienen días abiertos. Volvé al paso Horarios y abrí al menos un día.',
      }
    }
    for (let i = 0; i < row.count; i++) {
      courts.push({ name: `Cancha ${courts.length + 1}`, format: row.format, rules })
    }
  }
  return { ok: true, courts }
}

type CourtInput = z.infer<typeof createCourtSchema>

function buildCourtInputs(
  tenant: Pick<TenantRow, 'openingHours' | 'closesNextDay'>,
  planned: readonly PlannedCourt[],
): { ok: true; inputs: CourtInput[] } | { ok: false; error: string } {
  const inputs: CourtInput[] = []
  for (const court of planned) {
    const parsed = createCourtSchema.safeParse({
      name: court.name,
      surfaceType: 'synthetic_grass',
      isCovered: false,
      format: court.format,
      pricing: { rules: court.rules },
      photos: [],
    })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
    }
    // Backstop de cobertura (mismo gate que /canchas): un hueco entre reglas es
    // una hora operativa que nadie puede reservar online.
    const coverage = validatePricingRulesCoverage(
      court.rules,
      tenant.openingHours,
      tenant.closesNextDay,
    )
    if (!coverage.valid) {
      const sample = coverage.gaps
        .slice(0, 3)
        .map((g) => `${g.day} ${g.time}`)
        .join(', ')
      return { ok: false, error: `Precios sin cubrir: ${sample}` }
    }
    inputs.push(parsed.data)
  }
  return { ok: true, inputs }
}

/** ¿La cancha tiene alguna reserva o turno fijo? Si sí, no se puede borrar. */
async function hasReservations(
  tx: Parameters<Parameters<typeof withTenantContext>[1]>[0],
  courtId: string,
): Promise<boolean> {
  const [booking] = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.courtId, courtId))
    .limit(1)
  if (booking) return true
  const [abonado] = await tx
    .select({ id: abonados.id })
    .from(abonados)
    .where(eq(abonados.courtId, courtId))
    .limit(1)
  return !!abonado
}

const norm = (name: string) => name.trim().toLocaleLowerCase('es')

/**
 * Paso Precios: crea las canchas y guarda los precios cargados.
 *
 * Idempotente: volver con "Cambiar" y reenviar, o un doble POST, no duplica. Cada
 * cancha planeada reutiliza una existente (primero por nombre, "Cancha 2"; si no
 * coincide, como en los complejos del wizard viejo con nombres propios, por orden
 * de creación entre las que sobraron) y le actualiza formato y precios. Crea las
 * que faltan. Si la cantidad bajó, borra las sobrantes sin reservas (con reservas
 * las apaga), y solo mientras el onboarding no esté cerrado. Serializado por
 * complejo: dos envíos a la vez no duplican canchas.
 */
export async function createOnboardingCourts(
  tenant: Pick<TenantRow, 'id' | 'openingHours' | 'closesNextDay' | 'settings'>,
  input: WizardPricesInput,
  step: number,
): Promise<WizardActionResult> {
  const plan = planWizardCourts(tenant, input)
  if (!plan.ok) return { success: false, error: plan.error }
  const built = buildCourtInputs(tenant, plan.courts)
  if (!built.ok) return { success: false, error: built.error }

  await withTenantContext(tenant.id, async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`onboarding-courts:${tenant.id}`}, 0))`,
    )
    const existing = await listCourts(tenant.id, tx)
    const byName = new Map(existing.map((c) => [norm(c.name), c]))
    const used = new Set<string>()
    const unmatched: CourtInput[] = []
    const matches: { court: CourtRow; data: CourtInput }[] = []

    for (const data of built.inputs) {
      const court = byName.get(norm(data.name))
      if (court) {
        used.add(court.id)
        matches.push({ court, data })
      } else {
        unmatched.push(data)
      }
    }
    const free = existing.filter((c) => !used.has(c.id))
    for (const data of unmatched) {
      const court = free.shift()
      if (court) matches.push({ court, data })
      else await createCourt(tenant.id, data, tx)
    }
    for (const { court, data } of matches) {
      await updateCourt(court.id, tenant.id, { format: data.format, pricing: data.pricing }, tx)
      // Una sobrante que se había apagado y el dueño volvió a pedir.
      if (court.status === 'offline') await toggleStatus(court.id, tenant.id, 'online', tx)
    }

    // Bajó la cantidad: las que quedaron sin usar sobran. Con reservas no se
    // borran (FK): se apagan para que no cuenten ni se puedan reservar.
    if (tenant.settings.onboarding_completed !== true) {
      for (const court of free) {
        if (court.status === 'offline') continue
        if (await hasReservations(tx, court.id)) {
          await toggleStatus(court.id, tenant.id, 'offline', tx)
        } else {
          await tx
            .delete(courts)
            .where(and(eq(courts.id, court.id), eq(courts.tenantId, tenant.id)))
        }
      }
    }

    // `billed_courts` tiene que quedar diciendo la verdad desde el alta: si no,
    // la primera vez que el dueño entra a /canchas le salta un aviso de suba de
    // cuota por canchas que él ya cargó en el wizard. El tenant está en trial,
    // así que `changeBilledCourts` lo aplica en el acto y no cobra nada. Solo
    // sube: bajar por cuántas canchas se factura es una decisión deliberada del
    // dueño en Facturación, nunca un efecto lateral.
    const after = await getCourtCountAndBilled(tenant.id, tx)
    if (after.billedCourts !== null && after.onlineCourts > after.billedCourts) {
      await changeBilledCourts(tenant.id, after.onlineCourts, getBillingGateway(), tx)
    }
  })

  const prices: DraftPrices = {}
  for (const f of input.formats) {
    prices[String(f.format)] = hasNightPrice(f)
      ? { dayPrice: f.dayPrice, nightPrice: f.nightPrice }
      : { dayPrice: f.dayPrice }
  }
  const anyNight = input.formats.some(hasNightPrice)
  await updateTenantSettings(tenant.id, {
    onboarding_draft_prices: prices,
    ...(anyNight ? { onboarding_draft_cut_hour: input.cutHour ?? DEFAULT_CUT_HOUR } : {}),
    onboarding_step: step,
  })
  return { success: true }
}
