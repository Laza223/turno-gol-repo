import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import {
  InsufficientStockError,
  ProductNotFoundError,
  StockNotTrackedError,
} from './canteen.errors'
import type {
  AdjustStockInput,
  RegisterPurchaseInput,
  RegisterStockExitInput,
  StockLedgerEntry,
  StockMovementKind,
} from './canteen.types'

export type LockedProduct = {
  id: string
  name: string
  stock: number | null
}

/**
 * Lock de UNA fila de producto (los flujos de este service son mono-producto).
 * Exportado: canteen.service.ts lo reusa en updateProduct para comparar el
 * stock VIGENTE contra el patch antes de decidir si el catálogo puede tocarlo.
 */
export async function lockProduct(
  tenantId: string,
  productId: string,
  tx: DbTx,
): Promise<LockedProduct> {
  const rows = await tx.execute(sql`
    SELECT id, name, stock
    FROM canteen_products
    WHERE tenant_id = ${tenantId} AND id = ${productId}
    FOR UPDATE
  `)
  const product = (rows as unknown as LockedProduct[])[0]
  if (!product) throw new ProductNotFoundError(productId)
  return product
}

/**
 * Inserta un movimiento con idempotencia propia (los movimientos sin
 * cash_flow no pueden apoyarse en la key de cash_flows). Devuelve null si
 * la key ya existía — el caller NO debe repetir el efecto sobre el stock.
 */
async function insertMovementIdempotent(
  args: {
    tenantId: string
    productId: string
    kind: StockMovementKind
    qty: number
    unitCost?: number | null
    note?: string | null
    createdBy: string
    clientIdempotencyKey: string
  },
  tx: DbTx,
): Promise<string | null> {
  const rows = await tx.execute(sql`
    INSERT INTO stock_movements
      (tenant_id, product_id, kind, qty, unit_cost, note, created_by, client_idempotency_key)
    VALUES
      (${args.tenantId}, ${args.productId}, ${args.kind}::stock_movement_kind, ${args.qty},
       ${args.unitCost ?? null}, ${args.note ?? null}, ${args.createdBy}, ${args.clientIdempotencyKey})
    ON CONFLICT (client_idempotency_key) WHERE client_idempotency_key IS NOT NULL DO NOTHING
    RETURNING id
  `)
  return (rows as unknown as Array<{ id: string }>)[0]?.id ?? null
}

/**
 * Reposición de mercadería. `units` ya viene multiplicado por la UI
 * (packs × unidades por pack). Suma stock solo si el producto lo controla;
 * un producto sin control registra la compra en el ledger igual (auditoría
 * de gasto de mercadería) sin tocar stock.
 */
export async function registerPurchase(
  tenantId: string,
  staffUserId: string,
  input: RegisterPurchaseInput,
  tx: DbTx,
): Promise<{ duplicate: boolean }> {
  const product = await lockProduct(tenantId, input.productId, tx)

  const movementId = await insertMovementIdempotent(
    {
      tenantId,
      productId: product.id,
      kind: 'purchase',
      qty: input.units,
      unitCost: input.unitCost ?? null,
      note: input.note ?? null,
      createdBy: staffUserId,
      clientIdempotencyKey: input.clientIdempotencyKey,
    },
    tx,
  )
  if (!movementId) return { duplicate: true }

  if (typeof product.stock === 'number') {
    await tx.execute(sql`
      UPDATE canteen_products
      SET stock = stock + ${input.units}
      WHERE id = ${product.id} AND tenant_id = ${tenantId}
    `)
  }

  // Costo actual (sin historial): se pisa solo si el que repone lo pide.
  if (input.updateProductCost && input.unitCost != null) {
    await tx.execute(sql`
      UPDATE canteen_products
      SET cost = ${input.unitCost}
      WHERE id = ${product.id} AND tenant_id = ${tenantId}
    `)
  }

  // "Pagalo de la caja" (migr. 050): gasto expense/merchandise en la MISMA tx.
  // Reusa la key de idempotencia de la reposición (índices únicos separados:
  // stock_movements y cash_flows) — un reintento no duplica ninguno de los dos.
  // Si la caja del día está cerrada, createCashFlow tira DayAlreadyClosedError
  // y TODA la reposición rollbackea (atómico a propósito: el que repone
  // destilda "pagalo de la caja" y reintenta).
  if (input.expense && input.unitCost != null) {
    await createCashFlow(
      tenantId,
      staffUserId,
      {
        type: 'expense',
        category: 'merchandise',
        amount: input.unitCost * input.units,
        method: input.expense.method,
        description: `Mercadería: ${product.name} ×${input.units}`,
        clientIdempotencyKey: input.clientIdempotencyKey,
      },
      tx,
    )
  }

  return { duplicate: false }
}

/**
 * Salida no comercial (merma/rotura/cortesía/consumo interno): mueve stock,
 * NO toca caja. El motivo es obligatorio (validado en el schema) — es lo que
 * hace auditable la salida. Si el producto controla stock, no puede salir
 * más de lo que hay: una diferencia de conteo real se corrige con adjustStock.
 */
export async function registerExit(
  tenantId: string,
  staffUserId: string,
  input: RegisterStockExitInput,
  tx: DbTx,
): Promise<{ duplicate: boolean }> {
  const product = await lockProduct(tenantId, input.productId, tx)

  if (typeof product.stock === 'number' && product.stock < input.units) {
    throw new InsufficientStockError(product.name, product.stock)
  }

  const movementId = await insertMovementIdempotent(
    {
      tenantId,
      productId: product.id,
      kind: input.reason,
      qty: -input.units,
      note: input.note,
      createdBy: staffUserId,
      clientIdempotencyKey: input.clientIdempotencyKey,
    },
    tx,
  )
  if (!movementId) return { duplicate: true }

  if (typeof product.stock === 'number') {
    await tx.execute(sql`
      UPDATE canteen_products
      SET stock = stock - ${input.units}
      WHERE id = ${product.id} AND tenant_id = ${tenantId}
    `)
  }

  return { duplicate: false }
}

/**
 * Ajuste por conteo real: la UI manda el stock CONTADO y acá se registra el
 * delta como 'adjustment' (auditable). Solo para productos con control de
 * stock activo. Delta 0 = no-op (el CHECK chk_stock_qty_sign exige qty <> 0).
 */
export async function adjustStock(
  tenantId: string,
  staffUserId: string,
  input: AdjustStockInput,
  tx: DbTx,
): Promise<{ duplicate: boolean; delta: number }> {
  const product = await lockProduct(tenantId, input.productId, tx)

  if (typeof product.stock !== 'number') {
    throw new StockNotTrackedError(product.name)
  }

  const delta = input.newStock - product.stock
  if (delta === 0) return { duplicate: false, delta: 0 }

  const movementId = await insertMovementIdempotent(
    {
      tenantId,
      productId: product.id,
      kind: 'adjustment',
      qty: delta,
      note: input.note,
      createdBy: staffUserId,
      clientIdempotencyKey: input.clientIdempotencyKey,
    },
    tx,
  )
  if (!movementId) return { duplicate: true, delta: 0 }

  await tx.execute(sql`
    UPDATE canteen_products
    SET stock = ${input.newStock}
    WHERE id = ${product.id} AND tenant_id = ${tenantId}
  `)

  return { duplicate: false, delta }
}

/** Últimos movimientos del ledger, con nombre actual del producto (UI tab Productos). */
export async function getLedger(
  tenantId: string,
  tx: DbTx,
  opts: { limit?: number; productId?: string } = {},
): Promise<StockLedgerEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const rows = await tx.execute(sql`
    SELECT sm.*, cp.name AS product_name
    FROM stock_movements sm
    JOIN canteen_products cp ON cp.id = sm.product_id
    WHERE sm.tenant_id = ${tenantId}
      ${opts.productId ? sql`AND sm.product_id = ${opts.productId}` : sql``}
    ORDER BY sm.occurred_at DESC
    LIMIT ${limit}
  `)
  return (
    rows as unknown as Array<{
      id: string
      tenant_id: string
      product_id: string
      kind: StockMovementKind
      qty: number
      unit_cost: number | null
      unit_price: number | null
      note: string | null
      cash_flow_id: string | null
      tab_id: string | null
      created_by: string
      // B8: no es `Date | string`, es string y punto — ver la tabla de tipos en
      // `src/shared/db/client.ts`. La unión escondía que nunca llega un Date.
      occurred_at: string
      created_at: string
      product_name: string
    }>
  ).map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    productId: r.product_id,
    kind: r.kind,
    qty: r.qty,
    unitCost: r.unit_cost,
    unitPrice: r.unit_price,
    note: r.note,
    cashFlowId: r.cash_flow_id,
    tabId: r.tab_id,
    createdBy: r.created_by,
    occurredAt: new Date(r.occurred_at),
    createdAt: new Date(r.created_at),
    productName: r.product_name,
  }))
}
