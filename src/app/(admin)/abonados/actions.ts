'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import {
  createAbonado,
  pauseAbonado,
  reactivateAbonado,
  cancelAbonado,
} from '@/modules/abonados/abonado.service'
import {
  AbonadoConflictError,
  AbonadoNotFoundError,
  AbonadoAlreadyCanceledError,
  ReactivationConflictError,
} from '@/modules/abonados/abonado.errors'
import type { AbonadoRow, CreateAbonadoInput } from '@/modules/abonados/abonado.types'

export type AbonadoActionResult =
  | { success: true; abonado: AbonadoRow; slotsGenerated?: number; conflictDates?: string[] }
  | { success: false; error: string }

async function requireStaffTenant() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  return { user, tenant }
}

export async function createAbonadoAction(
  input: CreateAbonadoInput,
): Promise<AbonadoActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const { abonado, slotsGenerated, conflictDates } = await createAbonado(
        tenant.id,
        user.staffUserId!,
        input,
        tx,
      )
      return { success: true as const, abonado, slotsGenerated, conflictDates }
    } catch (err) {
      if (err instanceof AbonadoConflictError) {
        return { success: false as const, error: (err as Error).message }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/abonados')
  return result
}

export async function pauseAbonadoAction(id: string): Promise<AbonadoActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const abonado = await pauseAbonado(tenant.id, id, user.staffUserId!, tx)
      return { success: true as const, abonado }
    } catch (err) {
      if (err instanceof AbonadoNotFoundError || err instanceof AbonadoAlreadyCanceledError) {
        return { success: false as const, error: (err as Error).message }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/abonados')
  return result
}

export async function reactivateAbonadoAction(id: string): Promise<AbonadoActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const { abonado, slotsGenerated } = await reactivateAbonado(
        tenant.id,
        id,
        user.staffUserId!,
        tx,
      )
      return { success: true as const, abonado, slotsGenerated }
    } catch (err) {
      if (
        err instanceof AbonadoNotFoundError ||
        err instanceof AbonadoAlreadyCanceledError ||
        err instanceof ReactivationConflictError
      ) {
        return { success: false as const, error: (err as Error).message }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/abonados')
  return result
}

export async function cancelAbonadoAction(
  id: string,
  fromDate: string,
): Promise<AbonadoActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const abonado = await cancelAbonado(tenant.id, id, fromDate, user.staffUserId!, tx)
      return { success: true as const, abonado }
    } catch (err) {
      if (err instanceof AbonadoNotFoundError || err instanceof AbonadoAlreadyCanceledError) {
        return { success: false as const, error: (err as Error).message }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/abonados')
  return result
}
