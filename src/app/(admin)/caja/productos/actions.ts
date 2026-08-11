'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminStaffAction, requireOperatorStaff } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'
import { createProduct, updateProduct, deactivateProduct } from '@/modules/canteen/canteen.service'
import { registerPurchase, registerExit, adjustStock } from '@/modules/canteen/stock.service'
import {
  createProductSchema,
  updateProductSchema,
  registerPurchaseSchema,
  registerStockExitSchema,
  adjustStockSchema,
} from '@/modules/canteen/canteen.schema'
import {
  InsufficientStockError,
  ProductNotFoundError,
  StockNotEditableFromCatalogError,
  StockNotTrackedError,
} from '@/modules/canteen/canteen.errors'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'

export type ProductActionResult = { success: true } | { success: false; error: string }

export type StockActionResult = { success: true } | { success: false; error: string }

function revalidateCaja(): void {
  revalidatePath('/caja')
  revalidatePath('/caja/cantina')
  revalidatePath('/caja/productos')
}

/**
 * REGLA DE LA CLASE (hallazgo ROJO del panel de Fase 6, reproducido contra
 * Postgres real): el mapeo de errores de dominio va SIEMPRE FUERA de
 * withTenantContext. Atrapar la excepción DENTRO del callback transaccional y
 * devolver un objeto normal hace que drizzle COMMITEE la transacción — los
 * writes previos al throw (ej. la reposición de stock antes de que
 * createCashFlow rechace por caja cerrada) quedaban persistidos a medias.
 * La excepción tiene que escapar del callback para que Postgres ROLLBACKEE;
 * recién después se traduce al mensaje amigable.
 */
function mapStockError(err: unknown): string | null {
  if (err instanceof ProductNotFoundError) return 'Ese producto ya no existe.'
  if (err instanceof StockNotTrackedError) return 'Este producto no controla stock.'
  if (err instanceof StockNotEditableFromCatalogError) {
    return 'El stock se ajusta desde Reposición o Merma, no desde el catálogo.'
  }
  if (err instanceof InsufficientStockError) {
    return err.available <= 0
      ? `No queda stock de ${err.productName}.`
      : `Solo quedan ${err.available} de ${err.productName}.`
  }
  if (err instanceof DayAlreadyClosedError) {
    return 'La caja de hoy ya está cerrada. Destildá "Pagalo de la caja" para reponer igual, o registrá el gasto mañana.'
  }
  return null
}

// ── Catálogo (solo admin — Configuración, mismo criterio que la vieja
// saveCanteenProductsAction sobre tenants.settings.canteen_products) ─────────

export async function createProductAction(input: unknown): Promise<ProductActionResult> {
  const parsed = createProductSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  await withTenantContext(tenant.id, (tx) => createProduct(tenant.id, parsed.data, tx))
  revalidateCaja()
  return { success: true }
}

export async function updateProductAction(input: unknown): Promise<ProductActionResult> {
  const parsed = updateProductSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      updateProduct(tenant.id, parsed.data.productId, parsed.data.patch, tx),
    )
  } catch (err) {
    const mapped = mapStockError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true }
}

/** Soft delete (pausar). Reactivar es un updateProductAction con isActive: true. */
export async function deactivateProductAction(productId: string): Promise<ProductActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) => deactivateProduct(tenant.id, productId, tx))
  } catch (err) {
    const mapped = mapStockError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true }
}

// ── Stock (admin + manager — operativo día a día) ────────────────────────────

export async function registerPurchaseAction(input: unknown): Promise<StockActionResult> {
  const parsed = registerPurchaseSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // El catch va FUERA del contexto transaccional (ver mapStockError): con
  // "Pagalo de la caja" y la caja cerrada, createCashFlow tira DESPUÉS de que
  // la reposición ya escribió — la excepción debe rollbackear TODO.
  try {
    await withTenantContext(tenant.id, (tx) =>
      registerPurchase(tenant.id, user.staffUserId, parsed.data, tx),
    )
  } catch (err) {
    const mapped = mapStockError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true }
}

export async function registerStockExitAction(input: unknown): Promise<StockActionResult> {
  const parsed = registerStockExitSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      registerExit(tenant.id, user.staffUserId, parsed.data, tx),
    )
  } catch (err) {
    const mapped = mapStockError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true }
}

/**
 * Ajuste por conteo real (arqueo físico). Sin UI dedicada en esta fase —
 * el catálogo/reposición/salidas cubren el día a día; queda expuesta para
 * el arqueo físico (v1.5, ver design doc §fuera de scope).
 *
 * @public Decisión ya tomada y escrita: queda expuesta a propósito sin caller.
 */
export async function adjustStockAction(input: unknown): Promise<StockActionResult> {
  const parsed = adjustStockSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      adjustStock(tenant.id, user.staffUserId, parsed.data, tx),
    )
  } catch (err) {
    const mapped = mapStockError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateCaja()
  return { success: true }
}
