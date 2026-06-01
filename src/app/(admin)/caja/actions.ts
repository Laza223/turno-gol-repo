'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { uuid, dateStr, moneyCents, boundedText } from '@/shared/validation/primitives'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import {
  DayAlreadyClosedError,
  DayAlreadyCloseExistsError,
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
} from '@/modules/cashflow/cashflow.errors'
import type { CashFlowRow, DailyCashCloseRow, CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'

const createCashFlowSchema = z.object({
  type: z.enum(['income', 'adjustment']),
  category: z.enum(['booking', 'product_sale', 'other', 'no_show_correction']),
  amount: moneyCents,
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
  description: boundedText(500),
  bookingId: uuid.optional(),
  productId: uuid.optional(),
  // coerce: a Server Action may deliver this as a Date or an ISO string across the boundary.
  occurredAt: z.coerce.date().optional(),
})

const closeDaySchema = z.object({
  date: dateStr,
  declaredCash: moneyCents.optional(),
  note: boundedText(500).optional(),
})

export type CashFlowActionResult =
  | { success: true; cashFlow: CashFlowRow }
  | { success: false; error: string }

export type CloseDayActionResult =
  | { success: true; close: DailyCashCloseRow }
  | { success: false; error: string }

async function requireStaffTenant() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  return { user, tenant }
}

export async function createCashFlowAction(
  input: CreateCashFlowInput,
): Promise<CashFlowActionResult> {
  const parsed = createCashFlowSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const cashFlow = await createCashFlow(tenant.id, user.staffUserId!, parsed.data, tx)
      return { success: true as const, cashFlow }
    } catch (err) {
      if (err instanceof InvalidCashFlowTypeError || err instanceof InvalidCashFlowCategoryError) {
        return { success: false as const, error: (err as Error).message }
      }
      if (err instanceof DayAlreadyClosedError) {
        return { success: false as const, error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.' }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/caja')
  return result
}

export async function closeDayAction(
  date: string,
  declaredCash?: number,
  note?: string,
): Promise<CloseDayActionResult> {
  const parsed = closeDaySchema.safeParse({ date, declaredCash, note })
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const close = await closeDailyRegister(
        tenant.id,
        parsed.data.date,
        user.staffUserId!,
        { declaredCash: parsed.data.declaredCash, note: parsed.data.note },
        tx,
      )
      return { success: true as const, close }
    } catch (err) {
      if (err instanceof DayAlreadyCloseExistsError) {
        return { success: false as const, error: `La caja del ${parsed.data.date} ya fue cerrada.` }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/caja')
  return result
}
