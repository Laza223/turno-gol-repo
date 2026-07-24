import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { cleanupAll, createTestStaffUser, createTestTenant, ensureRoles } from '../helpers/tenant'
import { createProduct } from '@/modules/canteen/canteen.service'
import { adjustStock, registerExit, registerPurchase } from '@/modules/canteen/stock.service'
import {
  InsufficientStockError,
  ProductNotFoundError,
  StockNotTrackedError,
} from '@/modules/canteen/canteen.errors'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'

// Mismo cálculo que tests/integration/cashflow.test.ts: assertDayOpen compara
// contra el día ART (UTC-3), no el UTC del host que corre el test.
function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

const TODAY = artDateOf(new Date())

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

async function getProductRow(productId: string): Promise<{ stock: number | null; cost: number | null }> {
  const sql = getSql()
  const rows = await sql<{ stock: number | null; cost: number | null }[]>`
    SELECT stock, cost FROM canteen_products WHERE id = ${productId}
  `
  return rows[0]!
}

async function countMovements(productId: string, kind?: string): Promise<number> {
  const sql = getSql()
  const rows = kind
    ? await sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM stock_movements WHERE product_id = ${productId} AND kind = ${kind}
      `
    : await sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM stock_movements WHERE product_id = ${productId}
      `
  return rows[0]!.n
}

async function setup() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  return { tenant, staff }
}

async function getCashFlowsByKey(
  tenantId: string,
  key: string,
): Promise<{ type: string; category: string; amount: number; method: string; description: string }[]> {
  const sql = getSql()
  return sql<{ type: string; category: string; amount: number; method: string; description: string }[]>`
    SELECT type, category, amount, method, description FROM cash_flows
    WHERE tenant_id = ${tenantId} AND client_idempotency_key = ${key}
  `
}

async function countCashFlows(tenantId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM cash_flows WHERE tenant_id = ${tenantId}
  `
  return rows[0]!.n
}

describe('stock service — registerPurchase', () => {
  it('adds units to a controlled product and leaves one purchase movement', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Cerveza', price: 300000, stock: 10 }, tx),
    )

    const result = await withTenantContext(tenant.id, (tx) =>
      registerPurchase(
        tenant.id,
        staff.id,
        { productId: product.id, units: 24, unitCost: 100000, clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    expect(result.duplicate).toBe(false)
    const row = await getProductRow(product.id)
    expect(row.stock).toBe(34) // 10 + 24
    expect(await countMovements(product.id, 'purchase')).toBe(1)
  })

  it('registers the purchase in the ledger for a product WITHOUT stock control, but stock stays NULL', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Sin control de stock', price: 100000 }, tx),
    )
    expect(product.stock).toBeNull()

    await withTenantContext(tenant.id, (tx) =>
      registerPurchase(
        tenant.id,
        staff.id,
        { productId: product.id, units: 50, clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    expect(await countMovements(product.id, 'purchase')).toBe(1)
    const row = await getProductRow(product.id)
    expect(row.stock).toBeNull()
  })

  it('updateProductCost:true overwrites canteen_products.cost with the incoming unitCost', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Con costo', price: 200000, stock: 5, cost: 50000 }, tx),
    )

    await withTenantContext(tenant.id, (tx) =>
      registerPurchase(
        tenant.id,
        staff.id,
        {
          productId: product.id,
          units: 10,
          unitCost: 90000,
          updateProductCost: true,
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    const row = await getProductRow(product.id)
    expect(row.cost).toBe(90000)
  })

  it('without updateProductCost, a purchase with unitCost does NOT touch the current cost', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Costo fijo', price: 200000, stock: 5, cost: 50000 }, tx),
    )

    await withTenantContext(tenant.id, (tx) =>
      registerPurchase(
        tenant.id,
        staff.id,
        { productId: product.id, units: 10, unitCost: 999000, clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    const row = await getProductRow(product.id)
    expect(row.cost).toBe(50000) // no se movió: updateProductCost no vino en true
  })

  it('deduplicates a repeated clientIdempotencyKey: no double stock addition, no second movement', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Idempotente', price: 100000, stock: 5 }, tx),
    )
    const key = crypto.randomUUID()
    const input = { productId: product.id, units: 12, clientIdempotencyKey: key }

    const first = await withTenantContext(tenant.id, (tx) => registerPurchase(tenant.id, staff.id, input, tx))
    const second = await withTenantContext(tenant.id, (tx) => registerPurchase(tenant.id, staff.id, input, tx))

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(await countMovements(product.id, 'purchase')).toBe(1)
    const row = await getProductRow(product.id)
    expect(row.stock).toBe(17) // 5 + 12, NUNCA 5 + 24
  })
})

// migr. 050 — "Pagalo de la caja": registerPurchase con expense crea el
// cash_flow expense/merchandise en la MISMA tx que la reposición, reusando
// la clientIdempotencyKey (índices únicos separados en stock_movements y
// cash_flows: un reintento no duplica ninguno de los dos lados).
describe('stock service — registerPurchase con expense (migr. 050)', () => {
  it('crea un cash_flow expense/merchandise por units × unitCost, misma key en los dos lados', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Con gasto', price: 300000, stock: 5 }, tx),
    )
    const key = crypto.randomUUID()

    const result = await withTenantContext(tenant.id, (tx) =>
      registerPurchase(
        tenant.id,
        staff.id,
        {
          productId: product.id,
          units: 10,
          unitCost: 80000,
          expense: { method: 'cash' },
          clientIdempotencyKey: key,
        },
        tx,
      ),
    )

    expect(result.duplicate).toBe(false)
    const productRow = await getProductRow(product.id)
    expect(productRow.stock).toBe(15) // 5 + 10
    expect(await countMovements(product.id, 'purchase')).toBe(1)

    const cashFlowRows = await getCashFlowsByKey(tenant.id, key)
    expect(cashFlowRows).toHaveLength(1)
    expect(cashFlowRows[0]!.type).toBe('expense')
    expect(cashFlowRows[0]!.category).toBe('merchandise')
    expect(cashFlowRows[0]!.amount).toBe(800000) // 10 * 80000
    expect(cashFlowRows[0]!.method).toBe('cash')
  })

  it('reintento con la misma key: duplicate:true, NI segundo movimiento NI segundo cash_flow', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Gasto idempotente', price: 300000, stock: 5 }, tx),
    )
    const key = crypto.randomUUID()
    const input = {
      productId: product.id,
      units: 6,
      unitCost: 50000,
      expense: { method: 'transfer' as const },
      clientIdempotencyKey: key,
    }

    const first = await withTenantContext(tenant.id, (tx) => registerPurchase(tenant.id, staff.id, input, tx))
    const second = await withTenantContext(tenant.id, (tx) => registerPurchase(tenant.id, staff.id, input, tx))

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(await countMovements(product.id, 'purchase')).toBe(1)
    const productRow = await getProductRow(product.id)
    expect(productRow.stock).toBe(11) // 5 + 6, NUNCA 5 + 12

    const cashFlowRows = await getCashFlowsByKey(tenant.id, key)
    expect(cashFlowRows).toHaveLength(1)
  })

  it('con la caja de HOY cerrada y expense, rechaza TODO: ni movimiento, ni cash_flow, ni stock', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Caja cerrada', price: 300000, stock: 5 }, tx),
    )
    await withTenantContext(tenant.id, (tx) => closeDailyRegister(tenant.id, TODAY, staff.id, {}, 0, tx))
    const key = crypto.randomUUID()

    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerPurchase(
          tenant.id,
          staff.id,
          {
            productId: product.id,
            units: 4,
            unitCost: 70000,
            expense: { method: 'cash' },
            clientIdempotencyKey: key,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(DayAlreadyClosedError)

    // Atómico: la tx entera rollbackea — ni el movimiento ni el cash_flow ni
    // el update de stock sobreviven al throw dentro de withTenantContext.
    expect(await countMovements(product.id, 'purchase')).toBe(0)
    const productRow = await getProductRow(product.id)
    expect(productRow.stock).toBe(5) // no tocado
    expect(await countCashFlows(tenant.id)).toBe(0)
  })

  it('sin expense y con la caja de HOY cerrada, la reposición sigue OK (no toca la caja)', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Reposición sin gasto', price: 300000, stock: 5 }, tx),
    )
    await withTenantContext(tenant.id, (tx) => closeDailyRegister(tenant.id, TODAY, staff.id, {}, 0, tx))

    const result = await withTenantContext(tenant.id, (tx) =>
      registerPurchase(
        tenant.id,
        staff.id,
        {
          productId: product.id,
          units: 4,
          unitCost: 70000,
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    expect(result.duplicate).toBe(false)
    const productRow = await getProductRow(product.id)
    expect(productRow.stock).toBe(9) // 5 + 4, la reposición no depende de la caja
    expect(await countCashFlows(tenant.id)).toBe(0)
  })
})

describe('stock service — registerExit', () => {
  it('subtracts units and records the exit under its reason kind', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Rompible', price: 100000, stock: 10 }, tx),
    )

    const result = await withTenantContext(tenant.id, (tx) =>
      registerExit(
        tenant.id,
        staff.id,
        {
          productId: product.id,
          units: 3,
          reason: 'waste',
          note: 'se rompieron en el depósito',
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    expect(result.duplicate).toBe(false)
    const row = await getProductRow(product.id)
    expect(row.stock).toBe(7)
    expect(await countMovements(product.id, 'waste')).toBe(1)
  })

  it('throws InsufficientStockError when the requested units exceed current stock', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Poco stock', price: 100000, stock: 2 }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerExit(
          tenant.id,
          staff.id,
          {
            productId: product.id,
            units: 5,
            reason: 'internal_use',
            note: 'consumo del staff',
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError)

    expect(await countMovements(product.id)).toBe(0)
    const row = await getProductRow(product.id)
    expect(row.stock).toBe(2) // no tocado
  })
})

describe('stock service — adjustStock', () => {
  it('applies a positive delta (el conteo físico encuentra MÁS que el sistema)', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Recuento +', price: 100000, stock: 5 }, tx),
    )

    const result = await withTenantContext(tenant.id, (tx) =>
      adjustStock(
        tenant.id,
        staff.id,
        { productId: product.id, newStock: 8, note: 'conteo físico', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    expect(result.delta).toBe(3)
    const row = await getProductRow(product.id)
    expect(row.stock).toBe(8)
    expect(await countMovements(product.id, 'adjustment')).toBe(1)
  })

  it('applies a negative delta (el conteo físico encuentra MENOS que el sistema)', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Recuento -', price: 100000, stock: 10 }, tx),
    )

    const result = await withTenantContext(tenant.id, (tx) =>
      adjustStock(
        tenant.id,
        staff.id,
        { productId: product.id, newStock: 4, note: 'conteo físico', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    expect(result.delta).toBe(-6)
    const row = await getProductRow(product.id)
    expect(row.stock).toBe(4)
  })

  it('throws StockNotTrackedError for a product without stock control', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Sin control para ajustar', price: 100000 }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        adjustStock(
          tenant.id,
          staff.id,
          {
            productId: product.id,
            newStock: 3,
            note: 'no debería aplicar',
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(StockNotTrackedError)
  })

  it('delta 0 is a no-op: no movement row, duplicate:false, delta:0', async () => {
    const { tenant, staff } = await setup()
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Exacto', price: 100000, stock: 6 }, tx),
    )

    const result = await withTenantContext(tenant.id, (tx) =>
      adjustStock(
        tenant.id,
        staff.id,
        { productId: product.id, newStock: 6, note: 'coincide', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    expect(result).toEqual({ duplicate: false, delta: 0 })
    expect(await countMovements(product.id, 'adjustment')).toBe(0)
    const row = await getProductRow(product.id)
    expect(row.stock).toBe(6)
  })
})

describe('stock service — defensa cross-tenant', () => {
  it('registerPurchase sobre un producto de OTRO tenant lanza ProductNotFoundError', async () => {
    const { tenant: myTenant, staff: myStaff } = await setup()
    const sql = getSql()
    const otherTenant = await createTestTenant(sql)
    const foreignProduct = await withTenantContext(otherTenant.id, (tx) =>
      createProduct(otherTenant.id, { name: 'De otro complejo', price: 100000, stock: 10 }, tx),
    )

    await expect(
      withTenantContext(myTenant.id, (tx) =>
        registerPurchase(
          myTenant.id,
          myStaff.id,
          { productId: foreignProduct.id, units: 5, clientIdempotencyKey: crypto.randomUUID() },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(ProductNotFoundError)

    const row = await getProductRow(foreignProduct.id)
    expect(row.stock).toBe(10) // ni se tocó
  })
})
