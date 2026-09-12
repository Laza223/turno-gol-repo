'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { markRefundSettled } from '@/modules/payments/refund.service'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { bookingCode } from '@/lib/booking-code'

const settleSchema = z.object({
  refundPaymentId: uuid,
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
})

export type MarkRefundSettledResult =
  { success: true; alreadySettled?: boolean } | { success: false; error: string }

/**
 * El complejo marca que ya devolvió la seña.
 *
 * Esto NO mueve plata en MercadoPago: registra que la devolución ocurrió, sea
 * por donde sea que la haya hecho el complejo. El reembolso por API falla
 * siempre (403 de permisos), así que este es el camino real.
 *
 * Lo ejecuta cualquiera del staff que opera la caja (admin o encargado), mismo
 * criterio que cobrar una deuda.
 */
export async function markRefundSettledAction(
  refundPaymentId: string,
  method: string,
): Promise<MarkRefundSettledResult> {
  const parsed = settleSchema.safeParse({ refundPaymentId, method })
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const outcome = await withTenantContext(tenant.id, async (tx) => {
    const settled = await markRefundSettled(
      {
        refundPaymentId: parsed.data.refundPaymentId,
        tenantId: tenant.id,
        method: parsed.data.method,
        staffUserId: user.staffUserId!,
      },
      tx,
    )
    // Ya estaba saldada: alguien más tildó primero, o MercadoPago avisó por
    // webhook. Sin audit log y sin movimiento de caja duplicado.
    if (!settled) return { settled: false }

    // La plata que salió del cajón tiene que verse en la caja: la seña había
    // entrado como ingreso, y sin el egreso el neto por método queda inflado.
    // Las devoluciones por MercadoPago no tocan la caja física, así que no
    // generan movimiento.
    if (parsed.data.method !== 'cash' && parsed.data.method !== 'transfer') {
      return { settled: true }
    }

    const label = settled.bookingId ? ` — turno ${bookingCode(settled.bookingId)}` : ''
    await createCashFlow(
      tenant.id,
      user.staffUserId!,
      {
        type: 'expense',
        category: 'other_expense',
        method: parsed.data.method,
        amount: settled.amountCents,
        description: `Devolución de seña${label}`,
        ...(settled.bookingId ? { bookingId: settled.bookingId } : {}),
      },
      tx,
    )
    return { settled: true }
  })

  revalidateRefunds()
  return outcome.settled ? { success: true } : { success: true, alreadySettled: true }
}

function revalidateRefunds(): void {
  revalidatePath('/caja/cuentas')
  revalidatePath('/caja')
  revalidatePath('/dashboard')
}
