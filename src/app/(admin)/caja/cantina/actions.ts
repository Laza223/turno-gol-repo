'use server'

import { revalidatePath } from 'next/cache'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { sellTicketSchema } from '@/modules/canteen/canteen.schema'
import {
  EmptyTicketError,
  InsufficientStockError,
  ProductInactiveError,
  ProductNotFoundError,
} from '@/modules/canteen/canteen.errors'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'

export type SellTicketActionResult =
  | { success: true; total: number }
  | { success: false; error: string }

function revalidateCaja(): void {
  revalidatePath('/caja')
  revalidatePath('/caja/cantina')
  revalidatePath('/caja/productos')
}

/**
 * Venta de cantina contra las tablas reales (migr. 048): `sellTicket` hace el
 * dup-check de idempotencia + `FOR UPDATE` de productos + descuento de stock +
 * cash_flow, todo en una sola transacción (ver canteen-sale.service.ts). La UX
 * de venta sigue siendo la de hoy (grid + QuickSaleDialog, 2 taps) — acá el
 * ticket siempre llega con 1 línea; el multi-ítem es Fase 3.
 * Mapeo de errores es-AR: mismo copy que usaba el viejo sellCanteenProductAction
 * (caja/actions.ts, eliminada — JSONB tenants.settings.canteen_products).
 */
export async function sellTicketAction(input: unknown): Promise<SellTicketActionResult> {
  const parsed = sellTicketSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const sale = await sellTicket(tenant.id, user.staffUserId, parsed.data, tx)
      return { success: true as const, total: sale.total }
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return {
          success: false as const,
          error:
            err.available <= 0
              ? `No queda stock de ${err.productName}.`
              : `Solo quedan ${err.available} de ${err.productName}.`,
        }
      }
      if (err instanceof ProductNotFoundError) {
        return { success: false as const, error: 'Ese producto ya no existe.' }
      }
      if (err instanceof ProductInactiveError) {
        return { success: false as const, error: 'Ese producto está pausado.' }
      }
      if (err instanceof EmptyTicketError) {
        return { success: false as const, error: 'El ticket está vacío.' }
      }
      if (err instanceof DayAlreadyClosedError) {
        return {
          success: false as const,
          error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.',
        }
      }
      throw err
    }
  })

  if (result.success) revalidateCaja()
  return result
}
