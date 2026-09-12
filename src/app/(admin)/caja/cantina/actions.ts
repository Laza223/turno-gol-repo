'use server'

import { revalidatePath } from 'next/cache'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'
import { listProducts } from '@/modules/canteen/canteen.service'
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
  SaleBookingNotFoundError,
  TabChargeMismatchError,
  TabNotFoundError,
  TabNotOpenError,
} from '@/modules/canteen/canteen.errors'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import { formatArs } from '@/lib/format'

export type SellTicketActionResult =
  { success: true; total: number } | { success: false; error: string }

export type CreateTabActionResult =
  { success: true; debtorName: string; total: number } | { success: false; error: string }

export type SettleTabActionResult =
  { success: true; total: number } | { success: false; error: string }

export type CancelTabActionResult = { success: true } | { success: false; error: string }

function revalidateCaja(): void {
  // Vender (catálogo y fiados abiertos), Cuentas (el cobro entra al diario y a
  // los totales del día) y Productos (el stock bajó).
  revalidatePath('/caja')
  revalidatePath('/caja/cuentas')
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
  if (err instanceof SaleBookingNotFoundError) return 'Ese turno ya no existe.'
  if (err instanceof TabNotFoundError) return 'Ese fiado ya no existe.'
  if (err instanceof TabNotOpenError) return 'Ese fiado ya fue cobrado o anulado.'
  if (err instanceof TabChargeMismatchError) {
    return `Los cobros tienen que sumar exacto ${formatArs(err.expected)} (ingresaste ${formatArs(err.received)}).`
  }
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
    const mapped = mapCanteenError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true, total }
}

export type CanteenCatalogActionResult =
  { success: true; products: CanteenProductRow[] } | { success: false; error: string }

/**
 * Catálogo de cantina bajo demanda, para el panel del turno en la grilla
 * (Fase 3). Se carga al ABRIR el diálogo, no con la grilla: el stock cambia
 * durante todo el día y una grilla que quedó abierta desde la mañana mostraría
 * unidades que ya se vendieron. Además la grilla es la pantalla donde el admin
 * pasa el día — no merece pagar una query de cantina en cada render.
 */
export async function listCanteenForBookingAction(): Promise<CanteenCatalogActionResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const products = await withTenantContext(tenant.id, (tx) => listProducts(tenant.id, tx))

  return { success: true, products }
}

/**
 * Fiado ("anotáselo al capitán"): `createTab` descuenta stock YA (líneas
 * 'sale' agrupadas por tab_id) pero NO crea cash_flow.
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

/** Cobra el fiado: `settleTab` crea el cash_flow con `occurred_at = ahora` (la plata entra hoy). */
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
