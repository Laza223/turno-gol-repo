'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'
import { horariosFormDataToInput, horariosSchema } from '@/modules/tenants/opening-hours.schema'
import { listCourts, updateCourt } from '@/modules/courts/court.service'
import {
  compressGridToRules,
  expandRulesToGrid,
  fillGridGaps,
  mostFrequentRulePrice,
} from '@/modules/courts/pricing-grid'

export type HorariosActionResult =
  | {
      success: true
      /** Presente solo si el cambio de horario dejó (y ya completó) huecos de precio. */
      pricingFilled?: { courts: number; cells: number }
    }
  | { success: false; error: string }

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
  // horario puede dejar horas activas sin precio en canchas ya cargadas —
  // irreservables en silencio (calculatePrice devuelve null, createBooking
  // explota con PriceUnavailableError) hasta que alguien entra a revisarlas.
  // Se completa en la MISMA transacción que el cambio de horario: nunca hay
  // un instante donde el horario ya cambió pero el precio todavía no cubre
  // la franja nueva. Mismo criterio que "Copiar precios de otra cancha" y el
  // auto-relleno del editor de cancha (pricing-grid.ts: fillGridGaps).
  const pricingFilled = await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({ openingHours, closesNextDay, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id))

    const courtRows = await listCourts(tenant.id, tx)
    let filledCourts = 0
    let filledCells = 0
    for (const court of courtRows) {
      const grid = expandRulesToGrid(court.pricing.rules, openingHours, closesNextDay)
      // Semilla para el peor caso: el horario nuevo deja fuera de rango TODAS
      // las horas que tenían precio (el complejo cierra el único día con tarifa
      // cargada, o corre la franja entera). Ahí la grilla queda vacía y no hay
      // vecino de quien heredar, así que se reusa el precio que esa cancha ya
      // tenía guardado — es del propio complejo, no un número inventado. Sin
      // esto la cancha quedaba con el 100% de sus horas sin precio y en
      // silencio, que es justo lo que este relleno viene a evitar.
      const seedPrice = mostFrequentRulePrice(court.pricing.rules)
      const { grid: filledGrid, filled } = fillGridGaps(
        grid,
        openingHours,
        closesNextDay,
        seedPrice,
      )
      if (filled.length === 0) continue
      const rules = compressGridToRules(filledGrid, openingHours, closesNextDay)
      await updateCourt(court.id, tenant.id, { pricing: { rules } }, tx)
      filledCourts++
      filledCells += filled.length
    }
    return filledCourts > 0 ? { courts: filledCourts, cells: filledCells } : undefined
  })

  revalidatePath('/settings/horarios')
  revalidatePath('/settings/canchas')
  return pricingFilled ? { success: true, pricingFilled } : { success: true }
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
