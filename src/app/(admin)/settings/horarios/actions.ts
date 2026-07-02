'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'
import { horariosSchema } from '@/modules/tenants/opening-hours.schema'

export type HorariosActionResult =
  | { success: true }
  | { success: false; error: string }

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export async function updateHorariosAction(
  _prevState: HorariosActionResult,
  formData: FormData,
): Promise<HorariosActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const raw = {
    ...Object.fromEntries(
      DAYS.map((day) => [
        day,
        {
          open: formData.get(`${day}_open`) as string,
          close: formData.get(`${day}_close`) as string,
          // Hidden input presente solo si el día está cerrado (valor 'on').
          closed: formData.get(`${day}_closed`) === 'on',
        },
      ]),
    ),
    // Checkbox nativo: presente = 'on'. Día operativo (cierre post-medianoche).
    closesNextDay: formData.get('closes_next_day') === 'on',
  }

  const parsed = horariosSchema.safeParse(raw)
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

  revalidatePath('/settings/horarios')
  return { success: true }
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
