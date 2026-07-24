import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { createProduct, deactivateProduct } from '@/modules/canteen/canteen.service'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import {
  InsufficientStockError,
  ProductInactiveError,
  ProductNotFoundError,
} from '@/modules/canteen/canteen.errors'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { todayART } from '@/shared/time/art-date'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

async function countCashFlows(tenantId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM cash_flows WHERE tenant_id = ${tenantId}
  `
  return rows[0]!.n
}

async function countStockMovements(tenantId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM stock_movements WHERE tenant_id = ${tenantId}
  `
  return rows[0]!.n
}

async function getProductStock(productId: string): Promise<number | null> {
  const sql = getSql()
  const rows = await sql<{ stock: number | null }[]>`
    SELECT stock FROM canteen_products WHERE id = ${productId}
  `
  return rows[0]!.stock
}

describe('canteen sale — happy path (control positivo de la venta normal)', () => {
  it('sells a multi-line ticket: 1 cash_flow (income/product_sale, monto = suma DB) + N stock_movements (kind sale, qty negativa, unit_price snapshot) + stock descontado SOLO donde hay control', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const agua = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Agua', price: 150000, stock: 10 }, tx),
    )
    const gaseosa = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Gaseosa sin control', price: 200000 }, tx),
    )
    expect(gaseosa.stock).toBeNull()

    const result = await withTenantContext(tenant.id, (tx) =>
      sellTicket(
        tenant.id,
        staff.id,
        {
          lines: [
            { productId: agua.id, qty: 2 },
            { productId: gaseosa.id, qty: 1 },
          ],
          method: 'cash',
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    expect(result.duplicate).toBe(false)
    expect(result.total).toBe(150000 * 2 + 200000 * 1)

    const cashFlows = await sql<
      { id: string; type: string; category: string; amount: number; description: string }[]
    >`SELECT id, type, category, amount, description FROM cash_flows WHERE tenant_id = ${tenant.id}`
    expect(cashFlows).toHaveLength(1)
    expect(cashFlows[0]!.id).toBe(result.cashFlowId)
    expect(cashFlows[0]!.type).toBe('income')
    expect(cashFlows[0]!.category).toBe('product_sale')
    expect(cashFlows[0]!.amount).toBe(result.total)
    expect(cashFlows[0]!.description).toBe('Cantina: Agua x2, Gaseosa sin control')

    const movements = await sql<
      { product_id: string; qty: number; unit_price: number | null; cash_flow_id: string | null; kind: string }[]
    >`SELECT product_id, qty, unit_price, cash_flow_id, kind FROM stock_movements WHERE tenant_id = ${tenant.id}`
    expect(movements).toHaveLength(2)

    const aguaMove = movements.find((m) => m.product_id === agua.id)!
    const gaseosaMove = movements.find((m) => m.product_id === gaseosa.id)!
    expect(aguaMove.kind).toBe('sale')
    expect(aguaMove.qty).toBe(-2)
    expect(aguaMove.unit_price).toBe(150000)
    expect(aguaMove.cash_flow_id).toBe(result.cashFlowId)
    expect(gaseosaMove.kind).toBe('sale')
    expect(gaseosaMove.qty).toBe(-1)
    expect(gaseosaMove.unit_price).toBe(200000)
    expect(gaseosaMove.cash_flow_id).toBe(result.cashFlowId)

    expect(await getProductStock(agua.id)).toBe(8) // 10 - 2
    expect(await getProductStock(gaseosa.id)).toBeNull() // sin control, JAMÁS se toca
  })
})

describe('canteen sale — atomicidad', () => {
  it('si UNA línea no tiene stock, el ticket entero falla y NADA persiste (ni cash_flow, ni movements, ni stock tocado)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const productA = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Con stock de sobra', price: 100000, stock: 5 }, tx),
    )
    const productB = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Sin stock suficiente', price: 100000, stock: 1 }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        sellTicket(
          tenant.id,
          staff.id,
          {
            lines: [
              { productId: productA.id, qty: 1 }, // esta línea SÍ podría venderse sola
              { productId: productB.id, qty: 2 }, // pide 2, hay 1 -> rompe el ticket entero
            ],
            method: 'cash',
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError)

    expect(await countCashFlows(tenant.id)).toBe(0)
    expect(await countStockMovements(tenant.id)).toBe(0)
    // productA tenía stock de sobra pero NO debe tocarse: la validación es
    // ticket completo o nada, nunca "vendo lo que sí alcanza".
    expect(await getProductStock(productA.id)).toBe(5)
    expect(await getProductStock(productB.id)).toBe(1)
  })
})

describe('canteen sale — idempotencia', () => {
  it('secuencial: repetir la misma key devuelve duplicate:true sin un segundo descuento de stock', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Papas fritas', price: 120000, stock: 10 }, tx),
    )
    const key = crypto.randomUUID()
    const input = {
      lines: [{ productId: product.id, qty: 3 }],
      method: 'cash' as const,
      clientIdempotencyKey: key,
    }

    const first = await withTenantContext(tenant.id, (tx) => sellTicket(tenant.id, staff.id, input, tx))
    const second = await withTenantContext(tenant.id, (tx) => sellTicket(tenant.id, staff.id, input, tx))

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.cashFlowId).toBe(first.cashFlowId)
    expect(second.total).toBe(first.total)

    expect(await countCashFlows(tenant.id)).toBe(1)
    expect(await countStockMovements(tenant.id)).toBe(1)
    expect(await getProductStock(product.id)).toBe(7) // 10 - 3, NUNCA 10 - 6
  })

  it('concurrente: dos ventas EN PARALELO con la MISMA key descuentan stock una sola vez', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Chizitos', price: 90000, stock: 10 }, tx),
    )
    const key = crypto.randomUUID()
    const input = {
      lines: [{ productId: product.id, qty: 3 }],
      method: 'cash' as const,
      clientIdempotencyKey: key,
    }

    const [r1, r2] = await Promise.all([
      withTenantContext(tenant.id, (tx) => sellTicket(tenant.id, staff.id, input, tx)),
      withTenantContext(tenant.id, (tx) => sellTicket(tenant.id, staff.id, input, tx)),
    ])

    const duplicateFlags = [r1.duplicate, r2.duplicate].sort()
    expect(duplicateFlags).toEqual([false, true])
    expect(r1.total).toBe(r2.total)
    expect(r1.cashFlowId).toBe(r2.cashFlowId)

    expect(await countCashFlows(tenant.id)).toBe(1)
    expect(await countStockMovements(tenant.id)).toBe(1)
    expect(await getProductStock(product.id)).toBe(7) // 10 - 3, NUNCA 10 - 6
  })
})

describe('canteen sale — carrera de stock (keys distintas)', () => {
  it('con stock=1, dos ventas concurrentes con keys DISTINTAS: exactamente una gana, stock termina en 0 (nunca negativo)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Última unidad', price: 100000, stock: 1 }, tx),
    )

    const makeInput = () => ({
      lines: [{ productId: product.id, qty: 1 }],
      method: 'cash' as const,
      clientIdempotencyKey: crypto.randomUUID(),
    })

    const results = await Promise.allSettled([
      withTenantContext(tenant.id, (tx) => sellTicket(tenant.id, staff.id, makeInput(), tx)),
      withTenantContext(tenant.id, (tx) => sellTicket(tenant.id, staff.id, makeInput(), tx)),
    ])

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof sellTicket>>> => r.status === 'fulfilled',
    )
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.reason).toBeInstanceOf(InsufficientStockError)
    expect(fulfilled[0]!.value.duplicate).toBe(false)

    expect(await countCashFlows(tenant.id)).toBe(1)
    expect(await countStockMovements(tenant.id)).toBe(1)
    expect(await getProductStock(product.id)).toBe(0) // nunca negativo
  })
})

describe('canteen sale — sin deadlock entre tickets cruzados', () => {
  it('dos tickets concurrentes con productos cruzados ({A,B} y {B,A}) completan ambos (ORDER BY id evita el deadlock)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const productA = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Producto A', price: 100000, stock: 10 }, tx),
    )
    const productB = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Producto B', price: 100000, stock: 10 }, tx),
    )

    const ticket1 = {
      lines: [
        { productId: productA.id, qty: 1 },
        { productId: productB.id, qty: 1 },
      ],
      method: 'cash' as const,
      clientIdempotencyKey: crypto.randomUUID(),
    }
    const ticket2 = {
      lines: [
        { productId: productB.id, qty: 1 },
        { productId: productA.id, qty: 1 },
      ],
      method: 'cash' as const,
      clientIdempotencyKey: crypto.randomUUID(),
    }

    const [r1, r2] = await Promise.all([
      withTenantContext(tenant.id, (tx) => sellTicket(tenant.id, staff.id, ticket1, tx)),
      withTenantContext(tenant.id, (tx) => sellTicket(tenant.id, staff.id, ticket2, tx)),
    ])

    expect(r1.duplicate).toBe(false)
    expect(r2.duplicate).toBe(false)
    expect(await countCashFlows(tenant.id)).toBe(2)
    expect(await getProductStock(productA.id)).toBe(8) // 10 - 1 (ticket1) - 1 (ticket2)
    expect(await getProductStock(productB.id)).toBe(8)
  })
})

describe('canteen sale — estados terminales y transiciones inválidas', () => {
  it('con la caja del día ya cerrada, sellTicket lanza DayAlreadyClosedError y no toca stock', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Turrón', price: 80000, stock: 5 }, tx),
    )

    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, todayART(), staff.id, {}, 0, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        sellTicket(
          tenant.id,
          staff.id,
          {
            lines: [{ productId: product.id, qty: 1 }],
            method: 'cash',
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(DayAlreadyClosedError)

    expect(await countCashFlows(tenant.id)).toBe(0)
    expect(await getProductStock(product.id)).toBe(5)
  })

  it('un producto INACTIVO en el ticket lanza ProductInactiveError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Descontinuado', price: 100000, stock: 5 }, tx),
    )
    await withTenantContext(tenant.id, (tx) => deactivateProduct(tenant.id, product.id, tx))

    await expect(
      withTenantContext(tenant.id, (tx) =>
        sellTicket(
          tenant.id,
          staff.id,
          {
            lines: [{ productId: product.id, qty: 1 }],
            method: 'cash',
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(ProductInactiveError)

    expect(await countCashFlows(tenant.id)).toBe(0)
  })
})

describe('canteen sale — aislamiento (defensa cross-tenant)', () => {
  it('un producto de OTRO tenant en el ticket lanza ProductNotFoundError (control negativo de autorización)', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const staffA = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantA.id, staffA.id)
    const foreignProduct = await withTenantContext(tenantB.id, (tx) =>
      createProduct(tenantB.id, { name: 'De otro complejo', price: 100000, stock: 5 }, tx),
    )

    await expect(
      withTenantContext(tenantA.id, (tx) =>
        sellTicket(
          tenantA.id,
          staffA.id,
          {
            lines: [{ productId: foreignProduct.id, qty: 1 }],
            method: 'cash',
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(ProductNotFoundError)

    expect(await countCashFlows(tenantA.id)).toBe(0)
    // El stock del complejo ajeno ni se enteró del intento.
    expect(await getProductStock(foreignProduct.id)).toBe(5)
  })
})
