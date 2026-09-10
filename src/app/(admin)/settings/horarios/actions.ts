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
  countEmptyCells,
  expandRulesToGrid,
  fillGridGaps,
} from '@/modules/courts/pricing-grid'

export type HorariosActionResult =
  | {
      success: true
      /** Presente solo si el cambio de horario dejó (y ya completó) huecos de precio. */
      pricingFilled?: { courts: number; cells: number }
      /**
       * Horas que el horario nuevo dejó sin precio y que NO se completaron
       * solas, porque cubrirlas habría significado traer una tarifa de otro
       * día. Las tiene que cargar el dueño en Canchas; hasta entonces esas
       * franjas no se pueden reservar.
       */
      pricingPending?: { courts: number; cells: number }
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
  // a los cinco días hábiles enteros, escrita sin que nadie la vea. Esos huecos
  // se reportan para que el dueño los cargue en Canchas, donde el editor sí
  // sugiere a partir de otros días porque ahí los ve antes de guardar.
  const pricing = await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({ openingHours, closesNextDay, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id))

    const courtRows = await listCourts(tenant.id, tx)
    let filledCourts = 0
    let filledCells = 0
    let pendingCourts = 0
    let pendingCells = 0
    for (const court of courtRows) {
      const grid = expandRulesToGrid(court.pricing.rules, openingHours, closesNextDay)
      const { grid: filledGrid, filled } = fillGridGaps(
        grid,
        openingHours,
        closesNextDay,
        null,
        true,
      )
      const stillEmpty = countEmptyCells(filledGrid, openingHours, closesNextDay)
      if (stillEmpty > 0) {
        pendingCourts++
        pendingCells += stillEmpty
      }
      if (filled.length === 0) continue
      const rules = compressGridToRules(filledGrid, openingHours, closesNextDay)
      await updateCourt(court.id, tenant.id, { pricing: { rules } }, tx)
      filledCourts++
      filledCells += filled.length
    }
    return {
      filled: filledCourts > 0 ? { courts: filledCourts, cells: filledCells } : undefined,
      pending: pendingCourts > 0 ? { courts: pendingCourts, cells: pendingCells } : undefined,
    }
  })

  revalidatePath('/settings/horarios')
  revalidatePath('/canchas')
  return {
    success: true,
    ...(pricing.filled ? { pricingFilled: pricing.filled } : {}),
    ...(pricing.pending ? { pricingPending: pricing.pending } : {}),
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
