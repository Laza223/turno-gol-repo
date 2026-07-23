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
 * REGLA DE LA CLASE (hallazgo ROJO del panel de Fase 6): el mapeo de errores
 * de dominio va SIEMPRE FUERA de withTenantContext. Atrapar la excepción
 * DENTRO del callback transaccional y devolver un objeto normal hace que
 * drizzle COMMITEE lo escrito antes del throw (commit parcial). La excepción
 * escapa → Postgres rollbackea → recién ahí se traduce al mensaje amigable.
 */
function mapCanteenError(err: unknown): string | null {
  if (err instanceof InsufficientStockError) {
    return err.available <= 0
      ? `No queda stock de ${err.productName}.`
      : `Solo quedan ${err.available} de ${err.productName}.`
  }
  if (err instanceof ProductNotFoundError) return 'Ese producto ya no existe.'
  if (err instanceof ProductInactiveError) return 'Ese producto está pausado.'
  if (err instanceof EmptyTicketError) return 'El ticket está vacío.'
  if (err instanceof TabNotFoundError) return 'Ese fiado ya no existe.'
  if (err instanceof TabNotOpenError) return 'Ese fiado ya fue cobrado o anulado.'
  return null
}

/**
 * Venta de cantina contra las tablas reales (migr. 048): `sellTicket` hace el
 * dup-check de idempotencia + `FOR UPDATE` de productos + descuento de stock +
 * cash_flow, todo en una sola transacción (ver canteen-sale.service.ts).
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

  let total: number
  try {
    const sale = await withTenantContext(tenant.id, (tx) =>
      sellTicket(tenant.id, user.staffUserId, parsed.data, tx),
    )
    total = sale.total
  } catch (err) {
    if (err instanceof DayAlreadyClosedError) {
      return {
        success: false,
        error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.',
      }
    }
    const mapped = mapCanteenError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true, total }
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

  let debtorName: string
  let total: number
  try {
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(tenant.id, user.staffUserId, parsed.data, tx),
    )
    debtorName = tab.debtorName
    total = tab.totalAmount
  } catch (err) {
    const mapped = mapCanteenError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true, debtorName, total }
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

  let total: number
  try {
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      settleTab(tenant.id, user.staffUserId, parsed.data, tx),
    )
    total = tab.totalAmount
  } catch (err) {
    if (err instanceof DayAlreadyClosedError) {
      return {
        success: false,
        error: 'La caja de hoy ya está cerrada. Cobrá el fiado cuando la caja esté abierta.',
      }
    }
    const mapped = mapCanteenError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true, total }
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

  try {
    await withTenantContext(tenant.id, (tx) =>
      cancelTab(tenant.id, user.staffUserId, parsed.data, tx),
    )
  } catch (err) {
    const mapped = mapCanteenError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true }
}
