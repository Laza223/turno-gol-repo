'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import {
  DayAlreadyClosedError,
  DayAlreadyCloseExistsError,
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
} from '@/modules/cashflow/cashflow.errors'
import type { CashFlowRow, DailyCashCloseRow, CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'

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
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const cashFlow = await createCashFlow(tenant.id, user.staffUserId!, input, tx)
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
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const close = await closeDailyRegister(tenant.id, date, user.staffUserId!, { declaredCash, note }, tx)
      return { success: true as const, close }
    } catch (err) {
      if (err instanceof DayAlreadyCloseExistsError) {
        return { success: false as const, error: `La caja del ${date} ya fue cerrada.` }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/caja')
  return result
}
