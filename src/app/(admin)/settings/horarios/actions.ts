'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'
import {
  horariosFormDataToInput,
  horariosPriceField,
  horariosSchema,
} from '@/modules/tenants/opening-hours.schema'
import { listCourts, updateCourt } from '@/modules/courts/court.service'
import {
  activeHoursForDay,
  compressGridToRules,
  DAY_KEYS,
  daysWithEmptyCells,
  expandRulesToGrid,
  fillGridGaps,
  mostFrequentRulePrice,
  type DayKey,
} from '@/modules/courts/pricing-grid'

/**
 * Canchas que quedarían con un día abierto sin ningún precio. El horario NO se
 * guarda hasta que el dueño ponga cuánto cobra en cada una: abrir un día sin
 * tarifa deja turnos que se ven libres y nadie puede reservar.
 */
type HorariosNeedsPrices = {
  days: DayKey[]
  courts: {
    id: string
    name: string
    /** Lo que ya mandó el dueño, o la tarifa que más cobra esa cancha. */
    suggestedCents: number | null
  }[]
}

export type HorariosActionResult =
  | {
      success: true
      /** Presente solo si el cambio de horario dejó (y ya completó) huecos de precio. */
      pricingFilled?: { courts: number; cells: number }
    }
  | { success: false; error: string; needsPrices?: HorariosNeedsPrices }

function ownerPriceCents(formData: FormData, courtId: string): number | null {
  const raw = formData.get(horariosPriceField(courtId))
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const cents = Number(raw)
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

export async function updateHorariosAction(
  _prevState: HorariosActionResult,
  formData: FormData,
): Promise<HorariosActionResult> {
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

  // Auto-relleno de precios (decisión del dueño, no re-litigar): ampliar el
  // horario deja horas activas sin precio en canchas ya cargadas —
  // irreservables en silencio (calculatePrice devuelve null, createBooking
  // explota con PriceUnavailableError) hasta que alguien entra a revisarlas.
  // Se completa en la MISMA transacción que el cambio de horario: nunca hay
  // un instante donde el horario ya cambió pero el precio todavía no cubre
  // la franja nueva.
  //
  // Acá el relleno se limita al vecino del MISMO día (`soloVecinoDelMismoDia`),
  // que es literalmente "el precio de la hora de al lado": ampliar hasta las
  // 02:00 hereda de la 01:00 y listo. Traer una tarifa de otro día sería
  // cobrarle al jugador un precio que el dueño nunca eligió — un complejo con
  // precio sólo los sábados terminaría con la tarifa de fin de semana aplicada
  // a los cinco días hábiles enteros, escrita sin que nadie la vea.
  //
  // Lo que queda vacío después de eso es un día abierto sin ningún precio, y
  // ese horario no se guarda (2026-10-24, El Vagón abrió el domingo sin tarifa
  // y el bot no pudo reservar): se le pide al dueño cuánto cobra en cada cancha,
  // con la tarifa que más usa como sugerencia a la vista, y horario y precios
  // se guardan juntos.
  const result = await withTenantContext(
    tenant.id,
    async (
      tx,
    ): Promise<{ ok: true; filledCourts: number; filledCells: number } | HorariosNeedsPrices> => {
      const courtRows = await listCourts(tenant.id, tx)
      const plans = courtRows.map((court) => {
        const grid = expandRulesToGrid(court.pricing.rules, openingHours, closesNextDay)
        const { grid: filledGrid, filled } = fillGridGaps(
          grid,
          openingHours,
          closesNextDay,
          null,
          true,
        )
        return {
          court,
          grid: filledGrid,
          filledCells: filled.length,
          emptyDays: daysWithEmptyCells(filledGrid, openingHours, closesNextDay),
          ownerPrice: ownerPriceCents(formData, court.id),
        }
      })

      const pending = plans.filter((p) => p.emptyDays.length > 0)
      if (pending.some((p) => p.ownerPrice === null)) {
        const days = new Set(pending.flatMap((p) => p.emptyDays))
        return {
          days: DAY_KEYS.filter((day) => days.has(day)),
          courts: pending.map((p) => ({
            id: p.court.id,
            name: p.court.name,
            suggestedCents: p.ownerPrice ?? mostFrequentRulePrice(p.court.pricing.rules),
          })),
        }
      }

      await tx
        .update(tenants)
        .set({ openingHours, closesNextDay, updatedAt: new Date() })
        .where(eq(tenants.id, tenant.id))

      let filledCourts = 0
      let filledCells = 0
      for (const plan of plans) {
        if (plan.emptyDays.length > 0 && plan.ownerPrice !== null) {
          for (const day of plan.emptyDays) {
            for (const hour of activeHoursForDay(openingHours, day, closesNextDay)) {
              plan.grid[day][hour] ??= plan.ownerPrice
            }
          }
        } else if (plan.filledCells === 0) {
          continue
        }
        const rules = compressGridToRules(plan.grid, openingHours, closesNextDay)
        await updateCourt(plan.court.id, tenant.id, { pricing: { rules } }, tx)
        if (plan.filledCells > 0) {
          filledCourts++
          filledCells += plan.filledCells
        }
      }
      return { ok: true, filledCourts, filledCells }
    },
  )

  if (!('ok' in result)) {
    return {
      success: false,
      error: 'Falta el precio de los días que abrís. Sin precio no se puede guardar el horario.',
      needsPrices: result,
    }
  }

  revalidatePath('/settings/horarios')
  revalidatePath('/canchas')
  return {
    success: true,
    ...(result.filledCourts > 0
      ? { pricingFilled: { courts: result.filledCourts, cells: result.filledCells } }
      : {}),
  }
}

export async function addClosedDateAction(
  _prevState: HorariosActionResult,
  formData: FormData,
): Promise<HorariosActionResult> {
  const date = formData.get('date') as string
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, error: 'Fecha inválida.' }
  }
  // Validate that the date is a real calendar date (e.g. reject 2025-02-30).
  const parsed = new Date(date + 'T12:00:00')
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return { success: false, error: 'Fecha inválida.' }
  }

  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const existing = (tenant.closedDates ?? []) as unknown as string[]
  if (!existing.includes(date)) {
    await withTenantContext(tenant.id, async (tx) => {
      await tx
        .update(tenants)
        .set({
          closedDates: [...existing, date],
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenant.id))
    })
  }

  revalidatePath('/settings/horarios')
  return { success: true }
}

export async function removeClosedDateAction(
  _prevState: HorariosActionResult,
  formData: FormData,
): Promise<HorariosActionResult> {
  const date = formData.get('date') as string

  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const filtered = ((tenant.closedDates ?? []) as unknown as string[]).filter((d) => d !== date)

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({ closedDates: filtered, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/settings/horarios')
  return { success: true }
}
