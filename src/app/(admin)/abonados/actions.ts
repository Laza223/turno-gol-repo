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
  CourtNotFoundError,
} from '@/modules/abonados/abonado.errors'
import type { AbonadoRow, CreateAbonadoInput } from '@/modules/abonados/abonado.types'

export type AbonadoActionResult =
  | { success: true; abonado: AbonadoRow; slotsGenerated?: number; conflictDates?: string[] }
  | { success: false; error: string }

export async function createAbonadoAction(input: CreateAbonadoInput): Promise<AbonadoActionResult> {
  const parsed = createAbonadoSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Datos inválidos.' }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // Regla de la clase (rediseño Caja/Cantina): el catch va FUERA del contexto
  // transaccional — atrapar adentro y devolver un objeto commitea lo escrito
  // antes del throw. Acá los services tiran antes de escribir, pero el patrón
  // uniforme evita que un refactor futuro herede la mina.
  let created: { abonado: AbonadoRow; slotsGenerated: number; conflictDates: string[] }
  try {
    created = await withTenantContext(tenant.id, (tx) =>
      createAbonado(tenant.id, user.staffUserId!, parsed.data, tx),
    )
  } catch (err) {
    if (err instanceof AbonadoConflictError) {
      return { success: false, error: err.message }
    }
    if (err instanceof CourtNotFoundError) {
      return { success: false, error: 'Cancha no encontrada.' }
    }
    throw err
  }

  revalidatePath('/abonados')
  return {
    success: true,
    abonado: created.abonado,
    slotsGenerated: created.slotsGenerated,
    conflictDates: created.conflictDates,
  }
}

export async function pauseAbonadoAction(id: string): Promise<AbonadoActionResult> {
  const parsedId = uuid.safeParse(id)
  if (!parsedId.success) return { success: false, error: 'ID inválido.' }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let abonado: AbonadoRow
  try {
    abonado = await withTenantContext(tenant.id, (tx) =>
      pauseAbonado(tenant.id, parsedId.data, user.staffUserId!, tx),
    )
  } catch (err) {
    if (err instanceof AbonadoNotFoundError || err instanceof AbonadoAlreadyCanceledError) {
      return { success: false, error: (err as Error).message }
    }
    throw err
  }

  revalidatePath('/abonados')
  return { success: true, abonado }
}

export async function reactivateAbonadoAction(id: string): Promise<AbonadoActionResult> {
  const parsedId = uuid.safeParse(id)
  if (!parsedId.success) return { success: false, error: 'ID inválido.' }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let reactivated: { abonado: AbonadoRow; slotsGenerated: number }
  try {
    reactivated = await withTenantContext(tenant.id, (tx) =>
      reactivateAbonado(tenant.id, parsedId.data, user.staffUserId!, tx),
    )
  } catch (err) {
    if (
      err instanceof AbonadoNotFoundError ||
      err instanceof AbonadoAlreadyCanceledError ||
      err instanceof ReactivationConflictError
    ) {
      return { success: false, error: (err as Error).message }
    }
    throw err
  }

  revalidatePath('/abonados')
  return {
    success: true,
    abonado: reactivated.abonado,
    slotsGenerated: reactivated.slotsGenerated,
  }
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

  let abonado: AbonadoRow
  try {
    abonado = await withTenantContext(tenant.id, (tx) =>
      cancelAbonado(tenant.id, parsed.data.id, parsed.data.fromDate, user.staffUserId!, tx),
    )
  } catch (err) {
    if (err instanceof AbonadoNotFoundError || err instanceof AbonadoAlreadyCanceledError) {
      return { success: false, error: (err as Error).message }
    }
    throw err
  }

  revalidatePath('/abonados')
  return { success: true, abonado }
}
