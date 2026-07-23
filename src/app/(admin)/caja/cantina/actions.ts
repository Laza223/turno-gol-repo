'use server'

import { revalidatePath } from 'next/cache'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { createTab, settleTab, cancelTab } from '@/modules/canteen/canteen-tab.service'
import {
  sellTicketSchema,
  createTabSchema,
  settleTabSchema,
  cancelTabSchema,
} from '@/modules/canteen/canteen.schema'
import {
  EmptyTicketError,
  InsufficientStockError,
  ProductInactiveError,
  ProductNotFoundError,
  TabNotFoundError,
  TabNotOpenError,
} from '@/modules/canteen/canteen.errors'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'

export type SellTicketActionResult =
  | { success: true; total: number }
  | { success: false; error: string }

export type CreateTabActionResult =
  | { success: true; debtorName: string; total: number }
  | { success: false; error: string }

export type SettleTabActionResult =
  | { success: true; total: number }
  | { success: false; error: string }

export type CancelTabActionResult =
  | { success: true }
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

/**
 * Fiado ("anotáselo al capitán"): `createTab` descuenta stock YA (líneas
 * 'sale' agrupadas por tab_id) pero NO crea cash_flow — por eso NO mapea
 * DayAlreadyClosedError acá, `createTab` nunca la lanza (canteen-tab.service.ts).
 * Anotar un fiado está permitido con la caja de hoy cerrada; cobrarlo
 * (`settleTabAction`) o anularlo, no.
 */
export async function createTabAction(input: unknown): Promise<CreateTabActionResult> {
  const parsed = createTabSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const { tab } = await createTab(tenant.id, user.staffUserId, parsed.data, tx)
      return { success: true as const, debtorName: tab.debtorName, total: tab.totalAmount }
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
      throw err
    }
  })

  if (result.success) revalidateCaja()
  return result
}

/**
 * Cobra el fiado: `settleTab` crea el cash_flow con `occurred_at = ahora`
 * (la plata entra hoy) — hereda `assertDayOpen` de `createCashFlow`, a
 * diferencia de `createTab`.
 */
export async function settleTabAction(input: unknown): Promise<SettleTabActionResult> {
  const parsed = settleTabSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const { tab } = await settleTab(tenant.id, user.staffUserId, parsed.data, tx)
      return { success: true as const, total: tab.totalAmount }
    } catch (err) {
      if (err instanceof DayAlreadyClosedError) {
        return {
          success: false as const,
          error: 'La caja de hoy ya está cerrada. Cobrá el fiado cuando la caja esté abierta.',
        }
      }
      if (err instanceof TabNotFoundError) {
        return { success: false as const, error: 'Ese fiado ya no existe.' }
      }
      if (err instanceof TabNotOpenError) {
        return { success: false as const, error: 'Ese fiado ya fue cobrado o anulado.' }
      }
      throw err
    }
  })

  if (result.success) revalidateCaja()
  return result
}

/** Anula un fiado abierto: devuelve el stock entregado (ledger 'adjustment'); nunca tocó la caja. */
export async function cancelTabAction(input: unknown): Promise<CancelTabActionResult> {
  const parsed = cancelTabSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      await cancelTab(tenant.id, user.staffUserId, parsed.data, tx)
      return { success: true as const }
    } catch (err) {
      if (err instanceof TabNotFoundError) {
        return { success: false as const, error: 'Ese fiado ya no existe.' }
      }
      if (err instanceof TabNotOpenError) {
        return { success: false as const, error: 'Ese fiado ya fue cobrado o anulado.' }
      }
      throw err
    }
  })

  if (result.success) revalidateCaja()
  return result
}
