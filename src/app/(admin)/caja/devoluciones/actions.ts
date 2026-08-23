'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { markRefundSettled } from '@/modules/payments/refund.service'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { bookingCode } from '@/lib/booking-code'
import { captureMessage } from '@/lib/sentry'

const settleSchema = z.object({
  refundPaymentId: uuid,
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
})

export type MarkRefundSettledResult =
  | { success: true; alreadySettled?: boolean; cashFlowSkipped?: boolean }
  | { success: false; error: string }

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

  // El try/catch va FUERA del contexto transaccional: atraparlo adentro y
  // devolver un objeto commitea lo escrito antes del throw (regla de la clase,
  // ver caja/actions.ts).
  let outcome: { settled: boolean; cashFlowSkipped: boolean }
  try {
    outcome = await withTenantContext(tenant.id, async (tx) => {
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
      if (!settled) return { settled: false, cashFlowSkipped: false }

      // La plata que salió del cajón tiene que verse en la caja: la seña había
      // entrado como ingreso, y sin el egreso el efectivo esperado del cierre
      // queda inflado y el arqueo da corto. Las devoluciones por MercadoPago no
      // tocan la caja física, así que no generan movimiento.
      if (parsed.data.method !== 'cash' && parsed.data.method !== 'transfer') {
        return { settled: true, cashFlowSkipped: false }
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
      return { settled: true, cashFlowSkipped: false }
    })
  } catch (err) {
    // La caja del día ya cerró. La plata se devolvió en la vida real: perder el
    // registro por un problema contable secundario sería el peor de los dos
    // males. Se marca la devolución igual, sin el movimiento, y se avisa.
    if (err instanceof DayAlreadyClosedError) {
      const settledLate = await withTenantContext(tenant.id, (tx) =>
        markRefundSettled(
          {
            refundPaymentId: parsed.data.refundPaymentId,
            tenantId: tenant.id,
            method: parsed.data.method,
            staffUserId: user.staffUserId!,
          },
          tx,
        ),
      )
      captureMessage('refund settled after the cash day was closed', {
        level: 'warning',
        extra: {
          tenantId: tenant.id,
          refundPaymentId: parsed.data.refundPaymentId,
          method: parsed.data.method,
        },
      })
      revalidateRefunds()
      return {
        success: true,
        cashFlowSkipped: true,
        ...(settledLate ? {} : { alreadySettled: true }),
      }
    }
    throw err
  }

  revalidateRefunds()
  return outcome.settled ? { success: true } : { success: true, alreadySettled: true }
}

function revalidateRefunds(): void {
  revalidatePath('/caja/devoluciones')
  revalidatePath('/caja')
  revalidatePath('/dashboard')
}
