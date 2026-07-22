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
  StockNotTrackedError,
} from '@/modules/canteen/canteen.errors'

export type ProductActionResult =
  | { success: true }
  | { success: false; error: string }

export type StockActionResult =
  | { success: true }
  | { success: false; error: string }

function revalidateCaja(): void {
  revalidatePath('/caja')
  revalidatePath('/caja/cantina')
  revalidatePath('/caja/productos')
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

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      await updateProduct(tenant.id, parsed.data.productId, parsed.data.patch, tx)
      return { success: true as const }
    } catch (err) {
      if (err instanceof ProductNotFoundError) {
        return { success: false as const, error: 'Ese producto ya no existe.' }
      }
      throw err
    }
  })

  if (result.success) revalidateCaja()
  return result
}

/** Soft delete (pausar). Reactivar es un updateProductAction con isActive: true. */
export async function deactivateProductAction(productId: string): Promise<ProductActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      await deactivateProduct(tenant.id, productId, tx)
      return { success: true as const }
    } catch (err) {
      if (err instanceof ProductNotFoundError) {
        return { success: false as const, error: 'Ese producto ya no existe.' }
      }
      throw err
    }
  })

  if (result.success) revalidateCaja()
  return result
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

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      await registerPurchase(tenant.id, user.staffUserId, parsed.data, tx)
      return { success: true as const }
    } catch (err) {
      if (err instanceof ProductNotFoundError) {
        return { success: false as const, error: 'Ese producto ya no existe.' }
      }
      throw err
    }
  })

  if (result.success) revalidateCaja()
  return result
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

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      await registerExit(tenant.id, user.staffUserId, parsed.data, tx)
      return { success: true as const }
    } catch (err) {
      if (err instanceof ProductNotFoundError) {
        return { success: false as const, error: 'Ese producto ya no existe.' }
      }
      if (err instanceof InsufficientStockError) {
        return {
          success: false as const,
          error:
            err.available <= 0
              ? `No queda stock de ${err.productName}.`
              : `Solo quedan ${err.available} de ${err.productName}.`,
        }
      }
      throw err
    }
  })

  if (result.success) revalidateCaja()
  return result
}

/**
 * Ajuste por conteo real (arqueo físico). Sin UI dedicada en esta fase —
 * el catálogo/reposición/salidas cubren el día a día; queda expuesta para
 * el arqueo físico (v1.5, ver design doc §fuera de scope).
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

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      await adjustStock(tenant.id, user.staffUserId, parsed.data, tx)
      return { success: true as const }
    } catch (err) {
      if (err instanceof ProductNotFoundError) {
        return { success: false as const, error: 'Ese producto ya no existe.' }
      }
      if (err instanceof StockNotTrackedError) {
        return { success: false as const, error: 'Este producto no controla stock.' }
      }
      throw err
    }
  })

  if (result.success) revalidateCaja()
  return result
}
