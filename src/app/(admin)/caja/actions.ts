'use server'

import { revalidatePath } from 'next/cache'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { uuid, dateStr, moneyCents, boundedText } from '@/shared/validation/primitives'
import { requireAdminStaffAction, requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { cashFlowResponseSchema } from '@/modules/cashflow/cashflow.schema'
import { validateApiOutput } from '@/shared/api-output'
import {
  CloseDateInFutureError,
  DayAlreadyClosedError,
  DayAlreadyCloseExistsError,
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
} from '@/modules/cashflow/cashflow.errors'
import type { CashFlowRow, DailyCashCloseRow, CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

const createCashFlowSchema = z.object({
  type: z.enum(['income', 'adjustment', 'expense']),
  category: z.enum(['booking', 'product_sale', 'other', 'no_show_correction', 'operating_expense']),
  amount: moneyCents,
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
  description: boundedText(500),
  // R4 (ensayo general, hallazgo 🟡): SIN bookingId a propósito. Cobrar
  // vinculado a un booking tiene un único camino canónico —
  // addBookingChargeAction (reservas/actions.ts), que toma FOR UPDATE sobre
  // el booking y valida contra getBookingCharges antes de insertar. Este
  // schema no tenía ninguna de esas garantías: cualquier staff autenticado
  // podía invocar la Server Action directo (curl/devtools) con un bookingId
  // arbitrario y reproducir el síntoma de ENS-3 (turno de $100 "cobrado"
  // $570). La UI (RegisterMovementModal, CanteenQuickSale) nunca mandó este
  // campo. z.object() sin .strict() lo strippea en silencio si igual llega
  // en el input — createCashFlow queda con booking_id NULL siempre que se
  // invoca desde acá. El service (cashflow.service.ts) sigue aceptando
  // bookingId para sus callers legítimos (addBookingChargeAction,
  // recordDepositCashFlow) — no tocar esa firma.
  productId: uuid.optional(),
  // coerce: a Server Action may deliver this as a Date or an ISO string across the boundary.
  occurredAt: z.coerce.date().optional(),
  // Cruce #10: sin esta clave en el schema, z.object() la strippeaba en
  // safeParse y el ON CONFLICT (client_idempotency_key) DO NOTHING del
  // service nunca corría → doble-tap = venta duplicada en la caja.
  clientIdempotencyKey: uuid.optional(),
})

const closeDaySchema = z.object({
  date: dateStr,
  declaredCash: moneyCents.optional(),
  note: boundedText(500).optional(),
})

// Productos rápidos de cantina: viven en tenants.settings (JSONB), sin tabla propia.
const canteenProductsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      name: z.string().trim().min(1, 'El nombre no puede estar vacío.').max(40),
      price: z.number().int().positive('El precio debe ser mayor a 0.'),
      // Stock opcional ("por las dudas"): ausente = sin control de stock.
      stock: z.number().int().min(0).max(100000).optional(),
    }),
  )
  .max(24, 'Máximo 24 productos.')

const sellCanteenProductSchema = z.object({
  productId: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(99),
  method: z.enum(['cash', 'transfer', 'mercadopago']),
  occurredAt: z.coerce.date().optional(),
  clientIdempotencyKey: uuid,
})

export type CashFlowActionResult =
  | { success: true; cashFlow: CashFlowRow }
  | { success: false; error: string }

export type CanteenProductsActionResult =
  | { success: true }
  | { success: false; error: string }

export type SellCanteenProductResult =
  | { success: true; cashFlow: CashFlowRow }
  | { success: false; error: string }

export type CloseDayActionResult =
  | { success: true; close: DailyCashCloseRow }
  | { success: false; error: string }

export async function createCashFlowAction(
  input: CreateCashFlowInput,
): Promise<CashFlowActionResult> {
  const parsed = createCashFlowSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  // Cruce #2: rol leído de DB — solo admin/manager operan la caja.
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const cashFlow = await createCashFlow(tenant.id, user.staffUserId, parsed.data, tx)
      return { success: true as const, cashFlow }
    } catch (err) {
      if (err instanceof InvalidCashFlowTypeError || err instanceof InvalidCashFlowCategoryError) {
        return { success: false as const, error: (err as Error).message }
      }
      if (err instanceof DayAlreadyClosedError) {
        return { success: false as const, error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.' }
      }
      throw err
    }
  })

  if (result.success) {
    validateApiOutput(cashFlowResponseSchema, { data: result.cashFlow }, 'createCashFlowAction')
    revalidatePath('/caja')
  }
  return result
}

export async function saveCanteenProductsAction(
  products: unknown,
): Promise<CanteenProductsActionResult> {
  const parsed = canteenProductsSchema.safeParse(products)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  // Cruce #3: los productos de cantina son configuración del tenant
  // (tenants.settings.canteen_products) — solo admin, igual que /settings.
  // manager es "Sin acceso a configuración" según roles.ts.
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // El objeto va SIN JSON.stringify: el driver ya serializa una vez, y un
  // string pre-serializado llega como escalar jsonb — `objeto || escalar`
  // concatena como array y destruye los settings del tenant.
  const patch = { canteen_products: parsed.data }
  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || ${patch}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/caja')
  return { success: true }
}

/**
 * Venta de un producto de cantina con descuento de stock atómico. A diferencia
 * de createCashFlowAction (movimiento genérico de caja), acá el stock —cuando el
 * producto lo controla— se valida y descuenta en la MISMA transacción que el
 * cash_flow:
 *   1. `SELECT settings ... FOR UPDATE` sobre el tenant serializa las ventas
 *      concurrentes de cantina (carrera de stock).
 *   2. Idempotencia del doble-tap: si ya existe el cash_flow de esta
 *      `clientIdempotencyKey`, la venta ya se registró y NO se vuelve a
 *      descontar (el lock garantiza que la 2da la vea ya commiteada).
 * Productos con `stock === undefined` se venden sin límite (comportamiento por
 * defecto). Solo admin/manager operan la caja (`requireOperatorStaff`).
 */
export async function sellCanteenProductAction(
  input: unknown,
): Promise<SellCanteenProductResult> {
  const parsed = sellCanteenProductSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { productId, qty, method, occurredAt, clientIdempotencyKey } = parsed.data

  const result = await withTenantContext(tenant.id, async (tx) => {
    // Lock del tenant: serializa las ventas concurrentes de cantina.
    const rows = (await tx.execute(
      sql`SELECT settings FROM tenants WHERE id = ${tenant.id} FOR UPDATE`,
    )) as unknown as Array<{ settings: TenantSettings }>
    const products = rows[0]?.settings?.canteen_products ?? []
    const product = products.find((p) => p.id === productId)
    if (!product) return { success: false as const, error: 'Ese producto ya no existe.' }

    // Idempotencia PRIMERO (mismo criterio que addBookingChargeAction): si ya
    // existe el cash_flow de esta key, la venta ya se registró — se devuelve la
    // fila existente SIN re-validar ni volver a descontar stock. Chequear el
    // stock antes rompería el reintento: tras agotar el stock, un reintento
    // legítimo (misma key) caería en "sin stock" sobre una venta ya cobrada.
    const dup = (await tx.execute(
      sql`SELECT 1 FROM cash_flows WHERE client_idempotency_key = ${clientIdempotencyKey} LIMIT 1`,
    )) as unknown as unknown[]
    const isDuplicate = dup.length > 0

    const tracked = typeof product.stock === 'number'
    if (!isDuplicate && tracked && (product.stock as number) < qty) {
      const left = product.stock as number
      return {
        success: false as const,
        error:
          left <= 0 ? `No queda stock de ${product.name}.` : `Solo quedan ${left} de ${product.name}.`,
      }
    }

    let cashFlow: CashFlowRow
    try {
      cashFlow = await createCashFlow(
        tenant.id,
        user.staffUserId,
        {
          type: 'income',
          category: 'product_sale',
          amount: product.price * qty,
          method,
          description: qty === 1 ? product.name : `${product.name} x${qty}`,
          occurredAt,
          clientIdempotencyKey,
        },
        tx,
      )
    } catch (err) {
      if (err instanceof DayAlreadyClosedError) {
        return {
          success: false as const,
          error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.',
        }
      }
      throw err
    }

    if (!isDuplicate && tracked) {
      const nextProducts = products.map((p) =>
        p.id === productId ? { ...p, stock: (p.stock as number) - qty } : p,
      )
      const patch = { canteen_products: nextProducts }
      await tx
        .update(tenants)
        .set({ settings: sql`settings || ${patch}::jsonb`, updatedAt: new Date() })
        .where(eq(tenants.id, tenant.id))
    }

    return { success: true as const, cashFlow }
  })

  if (result.success) revalidatePath('/caja')
  return result
}

export async function closeDayAction(
  date: string,
  declaredCash?: number,
  note?: string,
): Promise<CloseDayActionResult> {
  const parsed = closeDaySchema.safeParse({ date, declaredCash, note })
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  // Cruce #2: el cierre de caja es inmutable — requiere admin/manager activo.
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const close = await closeDailyRegister(
        tenant.id,
        parsed.data.date,
        user.staffUserId,
        { declaredCash: parsed.data.declaredCash, note: parsed.data.note },
        tx,
      )
      return { success: true as const, close }
    } catch (err) {
      if (err instanceof CloseDateInFutureError) {
        return { success: false as const, error: 'No se puede cerrar una fecha futura.' }
      }
      if (err instanceof DayAlreadyCloseExistsError) {
        return { success: false as const, error: `La caja del ${parsed.data.date} ya fue cerrada.` }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/caja')
  return result
}
