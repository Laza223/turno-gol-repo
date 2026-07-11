'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid, moneyCents, boundedText } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { registerDebtPayment } from '@/modules/relationships/ptr.service'
import { NoDebtError, DebtOverpaymentError } from '@/modules/relationships/ptr.errors'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'

const positiveCents = moneyCents.refine((v) => v > 0, 'El monto debe ser mayor a 0.')
const methodEnum = z.enum(['cash', 'transfer', 'mercadopago', 'other'])

export type DebtPaymentResult =
  | { success: true; newBalance: number }
  | { success: false; error: string }

const debtPaymentSchema = z.object({
  playerId: uuid,
  amount: positiveCents,
  method: methodEnum,
  note: boundedText(200).optional(),
  clientIdempotencyKey: uuid.optional(),
})

export type DebtPaymentInput = z.input<typeof debtPaymentSchema>

/**
 * Tarea #9 — Registrar un pago que salda (total o parcial) la deuda del jugador
 * en este complejo. Reduce PTR.balance y registra un CashFlow income en la caja.
 */
export async function registerDebtPaymentAction(
  input: DebtPaymentInput,
): Promise<DebtPaymentResult> {
  const parsed = debtPaymentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const { newBalance } = await registerDebtPayment(
        tenant.id,
        user.staffUserId,
        parsed.data,
        tx,
      )
      return { success: true as const, newBalance }
    } catch (err) {
      if (err instanceof NoDebtError || err instanceof DebtOverpaymentError) {
        return { success: false as const, error: (err as Error).message }
      }
      if (err instanceof DayAlreadyClosedError) {
        return {
          success: false as const,
          error: 'La caja de hoy ya fue cerrada. Registrá el cobro como ajuste en Caja.',
        }
      }
      throw err
    }
  })

  if (result.success) {
    revalidatePath(`/jugadores/${parsed.data.playerId}`)
    revalidatePath('/jugadores')
    revalidatePath('/caja')
  }
  return result
}
