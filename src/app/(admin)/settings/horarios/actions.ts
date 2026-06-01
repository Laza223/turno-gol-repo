'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'
import { checkPinSessionAction } from '@/app/(admin)/actions/pin'

export type HorariosActionResult =
  | { success: true }
  | { success: false; error: string }

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/

const daySchema = z.object({
  open: z.string().regex(timeRegex, 'Formato HH:MM'),
  close: z.string().regex(timeRegex, 'Formato HH:MM'),
})

const horariosSchema = z.object({
  mon: daySchema, tue: daySchema, wed: daySchema, thu: daySchema,
  fri: daySchema, sat: daySchema, sun: daySchema,
})

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export async function updateHorariosAction(
  formData: FormData,
): Promise<HorariosActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const raw = Object.fromEntries(
    DAYS.map((day) => [
      day,
      {
        open: formData.get(`${day}_open`) as string,
        close: formData.get(`${day}_close`) as string,
      },
    ]),
  )

  const parsed = horariosSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Horarios inválidos.' }
  }

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({ openingHours: parsed.data, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/settings/horarios')
  return { success: true }
}

export async function addClosedDateAction(formData: FormData): Promise<HorariosActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  const date = formData.get('date') as string
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, error: 'Fecha inválida.' }
  }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

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

export async function removeClosedDateAction(formData: FormData): Promise<HorariosActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  const date = formData.get('date') as string
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

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
