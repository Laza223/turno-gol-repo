'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid, dateStr } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import {
  createAbonado,
  pauseAbonado,
  reactivateAbonado,
  cancelAbonado,
} from '@/modules/abonados/abonado.service'
import { createAbonadoSchema } from '@/modules/abonados/abonado.schema'
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

export async function createAbonadoAction(
  input: CreateAbonadoInput,
): Promise<AbonadoActionResult> {
  const parsed = createAbonadoSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Datos inválidos.' }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const { abonado, slotsGenerated, conflictDates } = await createAbonado(
        tenant.id,
        user.staffUserId!,
        parsed.data,
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
  const parsedId = uuid.safeParse(id)
  if (!parsedId.success) return { success: false, error: 'ID inválido.' }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const abonado = await pauseAbonado(tenant.id, parsedId.data, user.staffUserId!, tx)
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
  const parsedId = uuid.safeParse(id)
  if (!parsedId.success) return { success: false, error: 'ID inválido.' }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const { abonado, slotsGenerated } = await reactivateAbonado(
        tenant.id,
        parsedId.data,
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
  const parsed = z.object({ id: uuid, fromDate: dateStr }).safeParse({ id, fromDate })
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const abonado = await cancelAbonado(tenant.id, parsed.data.id, parsed.data.fromDate, user.staffUserId!, tx)
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
