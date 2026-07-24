import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { createProduct } from '@/modules/canteen/canteen.service'
import { cancelTab, createTab, listOpenTabs, settleTab } from '@/modules/canteen/canteen-tab.service'
import {
  InsufficientStockError,
  TabNotFoundError,
  TabNotOpenError,
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

// ─── Helpers de lectura cruda (mismo patrón que canteen-sale.test.ts: fuera
// de transacción, vía getSql(); local conecta como superusuario así que lo
// que aísla de verdad es el WHERE tenant_id explícito del service, no RLS). ───

type RawTabRow = {
  id: string
  tenant_id: string
  debtor_name: string
  status: string
  total_amount: number
  note: string | null
  created_by: string
  created_at: unknown
  settled_at: unknown
  settled_by: string | null
  settled_cash_flow_id: string | null
  canceled_at: unknown
  canceled_by: string | null
  canceled_reason: string | null
}

async function getTabRow(tabId: string): Promise<RawTabRow | undefined> {
  const sql = getSql()
  const rows = await sql<RawTabRow[]>`SELECT * FROM canteen_tabs WHERE id = ${tabId}`
  return rows[0]
}

async function countCanteenTabs(tenantId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM canteen_tabs WHERE tenant_id = ${tenantId}
  `
  return rows[0]!.n
}

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

type RawMovement = {
  product_id: string
  qty: number
  kind: string
  tab_id: string | null
  cash_flow_id: string | null
  unit_price: number | null
}

async function getMovementsForTab(tabId: string): Promise<RawMovement[]> {
  const sql = getSql()
  return sql<RawMovement[]>`
    SELECT product_id, qty, kind, tab_id, cash_flow_id, unit_price
    FROM stock_movements WHERE tab_id = ${tabId}
    ORDER BY kind, product_id
  `
}

async function getCashFlow(cashFlowId: string) {
  const sql = getSql()
  const rows = await sql<
    Array<{ id: string; type: string; category: string; amount: number; description: string }>
  >`
    SELECT id, type, category, amount, description FROM cash_flows WHERE id = ${cashFlowId}
  `
  return rows[0]
}

async function getAuditLogsForResource(resourceId: string) {
  const sql = getSql()
  return sql<Array<{ action: string; actor_id: string; actor_type: string; metadata: unknown }>>`
    SELECT action, actor_id, actor_type, metadata FROM audit_logs
    WHERE resource_id = ${resourceId} ORDER BY created_at
  `
}

describe('canteen tabs — createTab happy path (control positivo del fiado)', () => {
  it('crea el fiado open con total=Σ desde DB + N stock_movements sale con tab_id (sin cash_flow) + stock descontado solo en tracked + CERO cash_flows', async () => {
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

    const { tab, duplicate } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Juan (mesa 3)',
          lines: [
            { productId: agua.id, qty: 2 },
            { productId: gaseosa.id, qty: 1 },
          ],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    expect(duplicate).toBe(false)
    expect(tab.status).toBe('open')
    const expectedTotal = 150000 * 2 + 200000 * 1
    expect(tab.totalAmount).toBe(expectedTotal)

    // El total leído desde la DB (no el objeto de retorno) coincide.
    const dbRow = await getTabRow(tab.id)
    expect(dbRow).toBeDefined()
    expect(dbRow!.status).toBe('open')
    expect(dbRow!.total_amount).toBe(expectedTotal)

    const movements = await getMovementsForTab(tab.id)
    expect(movements).toHaveLength(2)
    for (const m of movements) {
      expect(m.kind).toBe('sale')
      expect(m.tab_id).toBe(tab.id)
      expect(m.cash_flow_id).toBeNull() // el fiado NUNCA genera cash_flow al crearse
    }
    const aguaMove = movements.find((m) => m.product_id === agua.id)!
    const gaseosaMove = movements.find((m) => m.product_id === gaseosa.id)!
    expect(aguaMove.qty).toBe(-2)
    expect(aguaMove.unit_price).toBe(150000)
    expect(gaseosaMove.qty).toBe(-1)
    expect(gaseosaMove.unit_price).toBe(200000)

    expect(await getProductStock(agua.id)).toBe(8) // 10 - 2
    expect(await getProductStock(gaseosa.id)).toBeNull() // sin control, JAMÁS se toca

    expect(await countCashFlows(tenant.id)).toBe(0)
  })
})

describe('canteen tabs — createTab idempotencia', () => {
  it('secuencial: repetir la misma key devuelve duplicate:true sin un segundo descuento de stock ni una segunda fila', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Papas fritas', price: 120000, stock: 10 }, tx),
    )
    const key = crypto.randomUUID()
    const input = {
      debtorName: 'María (fiado)',
      lines: [{ productId: product.id, qty: 3 }],
      clientIdempotencyKey: key,
    }

    const first = await withTenantContext(tenant.id, (tx) => createTab(tenant.id, staff.id, input, tx))
    const second = await withTenantContext(tenant.id, (tx) => createTab(tenant.id, staff.id, input, tx))

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.tab.id).toBe(first.tab.id)

    expect(await countCanteenTabs(tenant.id)).toBe(1)
    expect(await countStockMovements(tenant.id)).toBe(1)
    expect(await getProductStock(product.id)).toBe(7) // 10 - 3, NUNCA 10 - 6
  })

  it('concurrente: dos createTab EN PARALELO con la MISMA key crean un solo fiado y descuentan stock una sola vez', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Chizitos', price: 90000, stock: 10 }, tx),
    )
    const key = crypto.randomUUID()
    const input = {
      debtorName: 'Doble tap',
      lines: [{ productId: product.id, qty: 3 }],
      clientIdempotencyKey: key,
    }

    const [r1, r2] = await Promise.all([
      withTenantContext(tenant.id, (tx) => createTab(tenant.id, staff.id, input, tx)),
      withTenantContext(tenant.id, (tx) => createTab(tenant.id, staff.id, input, tx)),
    ])

    const dupFlags = [r1.duplicate, r2.duplicate].sort()
    expect(dupFlags).toEqual([false, true])
    expect(r1.tab.id).toBe(r2.tab.id)

    expect(await countCanteenTabs(tenant.id)).toBe(1)
    expect(await countStockMovements(tenant.id)).toBe(1)
    expect(await getProductStock(product.id)).toBe(7) // 10 - 3, NUNCA 10 - 6
  })
})

describe('canteen tabs — crear con caja cerrada (asimetría deliberada del modelo)', () => {
  it('createTab con la caja de HOY ya cerrada está PERMITIDO (el fiado no toca la caja)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Alfajor', price: 80000, stock: 5 }, tx),
    )

    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, todayART(), staff.id, {}, 0, tx),
    )

    const { tab, duplicate } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Con la caja cerrada',
          lines: [{ productId: product.id, qty: 1 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    expect(duplicate).toBe(false)
    expect(tab.status).toBe('open')
    expect(await getProductStock(product.id)).toBe(4)
  })
})

describe('canteen tabs — createTab atomicidad (stock insuficiente)', () => {
  it('si UNA línea no tiene stock, el fiado entero falla y NADA persiste (ni tab, ni movements, ni stock tocado)', async () => {
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
        createTab(
          tenant.id,
          staff.id,
          {
            debtorName: 'Pedido grande',
            lines: [
              { productId: productA.id, qty: 1 }, // esta línea SÍ podría fiarse sola
              { productId: productB.id, qty: 2 }, // pide 2, hay 1 -> rompe el fiado entero
            ],
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError)

    expect(await countCanteenTabs(tenant.id)).toBe(0)
    expect(await countStockMovements(tenant.id)).toBe(0)
    expect(await getProductStock(productA.id)).toBe(5) // tenía stock de sobra pero NO se toca
    expect(await getProductStock(productB.id)).toBe(1)
  })
})

describe('canteen tabs — settleTab happy path', () => {
  it('salda el fiado: cash_flow income/product_sale con amount=total_amount y descripción "Fiado cobrado — {nombre}" + tab paid con settled_*', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Cerveza', price: 120000, stock: 10 }, tx),
    )

    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Ramiro',
          lines: [{ productId: product.id, qty: 2 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    const { tab: settled, duplicate } = await withTenantContext(tenant.id, (tx) =>
      settleTab(
        tenant.id,
        staff.id,
        { tabId: tab.id, method: 'cash', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    expect(duplicate).toBe(false)
    expect(settled.status).toBe('paid')
    expect(settled.settledCashFlowId).not.toBeNull()
    expect(settled.settledBy).toBe(staff.id)
    expect(settled.settledAt).not.toBeNull()

    const cf = await getCashFlow(settled.settledCashFlowId!)
    expect(cf).toBeDefined()
    expect(cf!.type).toBe('income')
    expect(cf!.category).toBe('product_sale')
    expect(cf!.amount).toBe(tab.totalAmount)
    expect(cf!.description).toBe('Fiado cobrado — Ramiro')

    // Saldar NO vuelve a tocar el ledger de stock (eso ya pasó al crear el fiado).
    expect(await countStockMovements(tenant.id)).toBe(1)
  })
})

describe('canteen tabs — settleTab idempotencia', () => {
  it('una 2da llamada sobre un tab ya PAID devuelve duplicate:true sin crear un 2do cash_flow', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Gaseosa', price: 90000, stock: 10 }, tx),
    )
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Cliente frecuente',
          lines: [{ productId: product.id, qty: 1 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )
    const settleKey = crypto.randomUUID()
    const first = await withTenantContext(tenant.id, (tx) =>
      settleTab(tenant.id, staff.id, { tabId: tab.id, method: 'cash', clientIdempotencyKey: settleKey }, tx),
    )
    expect(first.duplicate).toBe(false)

    const second = await withTenantContext(tenant.id, (tx) =>
      settleTab(tenant.id, staff.id, { tabId: tab.id, method: 'cash', clientIdempotencyKey: settleKey }, tx),
    )

    expect(second.duplicate).toBe(true)
    expect(second.tab.settledCashFlowId).toBe(first.tab.settledCashFlowId)
    expect(await countCashFlows(tenant.id)).toBe(1)
  })

  it('carrera: dos settleTab CONCURRENTES con keys DISTINTAS sobre el MISMO tab producen exactamente 1 cash_flow y paid una sola vez', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Snack', price: 70000, stock: 10 }, tx),
    )
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Carrera de settle',
          lines: [{ productId: product.id, qty: 1 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    const [r1, r2] = await Promise.all([
      withTenantContext(tenant.id, (tx) =>
        settleTab(tenant.id, staff.id, { tabId: tab.id, method: 'cash', clientIdempotencyKey: crypto.randomUUID() }, tx),
      ),
      withTenantContext(tenant.id, (tx) =>
        settleTab(tenant.id, staff.id, { tabId: tab.id, method: 'cash', clientIdempotencyKey: crypto.randomUUID() }, tx),
      ),
    ])

    const dupFlags = [r1.duplicate, r2.duplicate].sort()
    expect(dupFlags).toEqual([false, true])
    expect(await countCashFlows(tenant.id)).toBe(1)

    const finalRow = await getTabRow(tab.id)
    expect(finalRow!.status).toBe('paid')
  })
})

describe('canteen tabs — settleTab con caja cerrada (asimetría: crear no toca caja, saldar sí)', () => {
  it('con la caja de HOY ya cerrada, settleTab lanza DayAlreadyClosedError y el tab sigue open', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Turrón', price: 80000, stock: 5 }, tx),
    )
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Antes del cierre',
          lines: [{ productId: product.id, qty: 1 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, todayART(), staff.id, {}, 0, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        settleTab(tenant.id, staff.id, { tabId: tab.id, method: 'cash', clientIdempotencyKey: crypto.randomUUID() }, tx),
      ),
    ).rejects.toBeInstanceOf(DayAlreadyClosedError)

    const row = await getTabRow(tab.id)
    expect(row!.status).toBe('open')
    expect(row!.settled_cash_flow_id).toBeNull()
    expect(await countCashFlows(tenant.id)).toBe(0)
  })
})

describe('canteen tabs — cancelTab', () => {
  it('anula un fiado open: adjustment +qty por línea (par sale/adjustment en el ledger), stock restaurado SOLO en tracked, status canceled con reason, audit log', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const agua = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Agua fría', price: 150000, stock: 10 }, tx),
    )
    const gaseosa = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Gaseosa sin control', price: 200000 }, tx),
    )

    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Pedido a anular',
          lines: [
            { productId: agua.id, qty: 2 },
            { productId: gaseosa.id, qty: 1 },
          ],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )
    expect(await getProductStock(agua.id)).toBe(8) // 10 - 2

    const canceled = await withTenantContext(tenant.id, (tx) =>
      cancelTab(tenant.id, staff.id, { tabId: tab.id, reason: 'Pedido mal cargado' }, tx),
    )

    expect(canceled.status).toBe('canceled')
    expect(canceled.canceledReason).toBe('Pedido mal cargado')
    expect(canceled.canceledAt).not.toBeNull()
    expect(canceled.canceledBy).toBe(staff.id)

    const movements = await getMovementsForTab(tab.id)
    expect(movements).toHaveLength(4) // 2 sale + 2 adjustment (append-only, nunca se borra)

    const aguaAdj = movements.find((m) => m.product_id === agua.id && m.kind === 'adjustment')
    expect(aguaAdj).toBeDefined()
    expect(aguaAdj!.qty).toBe(2) // compensa la venta de -2

    const gaseosaAdj = movements.find((m) => m.product_id === gaseosa.id && m.kind === 'adjustment')
    expect(gaseosaAdj).toBeDefined()
    expect(gaseosaAdj!.qty).toBe(1)

    expect(await getProductStock(agua.id)).toBe(10) // restaurado
    expect(await getProductStock(gaseosa.id)).toBeNull() // sin control, NUNCA se toca

    const audits = await getAuditLogsForResource(tab.id)
    const cancelAudit = audits.find((a) => a.action === 'canteen.tab_canceled')
    expect(cancelAudit).toBeDefined()
    expect(cancelAudit!.actor_type).toBe('staff')
    expect(cancelAudit!.actor_id).toBe(staff.id)
  })

  it('cancelTab sobre un tab ya PAID lanza TabNotOpenError (transición inválida)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Papas', price: 100000, stock: 5 }, tx),
    )
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Ya pagado',
          lines: [{ productId: product.id, qty: 1 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )
    await withTenantContext(tenant.id, (tx) =>
      settleTab(tenant.id, staff.id, { tabId: tab.id, method: 'cash', clientIdempotencyKey: crypto.randomUUID() }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        cancelTab(tenant.id, staff.id, { tabId: tab.id, reason: 'demasiado tarde' }, tx),
      ),
    ).rejects.toBeInstanceOf(TabNotOpenError)

    // El estado paid no se corrompió por el intento fallido.
    const row = await getTabRow(tab.id)
    expect(row!.status).toBe('paid')
  })
})

describe('canteen tabs — aislamiento cross-tenant (control positivo Y negativo)', () => {
  it('settleTab de un tab de OTRO tenant lanza TabNotFoundError (negativo); el dueño SÍ puede saldarlo (positivo)', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const staffA = await createTestStaffUser(sql)
    const staffB = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantA.id, staffA.id)
    await linkStaffToTenant(sql, tenantB.id, staffB.id)
    const productB = await withTenantContext(tenantB.id, (tx) =>
      createProduct(tenantB.id, { name: 'De otro complejo', price: 100000, stock: 5 }, tx),
    )
    const { tab: foreignTab } = await withTenantContext(tenantB.id, (tx) =>
      createTab(
        tenantB.id,
        staffB.id,
        {
          debtorName: 'Del complejo B',
          lines: [{ productId: productB.id, qty: 1 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    // Negativo: tenantA no puede saldar un tab que no es suyo.
    await expect(
      withTenantContext(tenantA.id, (tx) =>
        settleTab(
          tenantA.id,
          staffA.id,
          { tabId: foreignTab.id, method: 'cash', clientIdempotencyKey: crypto.randomUUID() },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(TabNotFoundError)

    const rowAfterAttempt = await getTabRow(foreignTab.id)
    expect(rowAfterAttempt!.status).toBe('open') // el intento ajeno no tocó nada
    expect(await countCashFlows(tenantA.id)).toBe(0)

    // Positivo: el dueño real (tenantB) sí puede saldarlo — el 404 de arriba
    // no es un guard roto que bloquea a todo el mundo (cobertura ilusoria).
    const { duplicate } = await withTenantContext(tenantB.id, (tx) =>
      settleTab(
        tenantB.id,
        staffB.id,
        { tabId: foreignTab.id, method: 'cash', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )
    expect(duplicate).toBe(false)
    expect(await countCashFlows(tenantB.id)).toBe(1)
  })

  it('cancelTab de un tab de OTRO tenant lanza TabNotFoundError (negativo); el dueño SÍ puede anularlo (positivo)', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const staffA = await createTestStaffUser(sql)
    const staffB = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantA.id, staffA.id)
    await linkStaffToTenant(sql, tenantB.id, staffB.id)
    const productB = await withTenantContext(tenantB.id, (tx) =>
      createProduct(tenantB.id, { name: 'De otro complejo (cancel)', price: 100000, stock: 5 }, tx),
    )
    const { tab: foreignTab } = await withTenantContext(tenantB.id, (tx) =>
      createTab(
        tenantB.id,
        staffB.id,
        {
          debtorName: 'Del complejo B (cancel)',
          lines: [{ productId: productB.id, qty: 1 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    // Negativo: tenantA no puede anular un tab que no es suyo.
    await expect(
      withTenantContext(tenantA.id, (tx) =>
        cancelTab(tenantA.id, staffA.id, { tabId: foreignTab.id, reason: 'intento ajeno' }, tx),
      ),
    ).rejects.toBeInstanceOf(TabNotFoundError)

    const rowAfterAttempt = await getTabRow(foreignTab.id)
    expect(rowAfterAttempt!.status).toBe('open')

    // Positivo: el dueño real (tenantB) sí puede anularlo.
    const canceled = await withTenantContext(tenantB.id, (tx) =>
      cancelTab(tenantB.id, staffB.id, { tabId: foreignTab.id, reason: 'anulación legítima' }, tx),
    )
    expect(canceled.status).toBe('canceled')
  })
})

describe('canteen tabs — listOpenTabs', () => {
  it('devuelve solo los open, ordenados por created_at ASC, y nunca los de otro tenant', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const staffA = await createTestStaffUser(sql)
    const staffB = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantA.id, staffA.id)
    await linkStaffToTenant(sql, tenantB.id, staffB.id)
    const productA = await withTenantContext(tenantA.id, (tx) =>
      createProduct(tenantA.id, { name: 'Producto A', price: 50000, stock: 10 }, tx),
    )
    const productB = await withTenantContext(tenantB.id, (tx) =>
      createProduct(tenantB.id, { name: 'Producto B', price: 50000, stock: 10 }, tx),
    )

    const makeInput = (debtorName: string, productId: string) => ({
      debtorName,
      lines: [{ productId, qty: 1 }],
      clientIdempotencyKey: crypto.randomUUID(),
    })

    const { tab: tab1 } = await withTenantContext(tenantA.id, (tx) =>
      createTab(tenantA.id, staffA.id, makeInput('Primero', productA.id), tx),
    )
    const { tab: tab2 } = await withTenantContext(tenantA.id, (tx) =>
      createTab(tenantA.id, staffA.id, makeInput('Segundo', productA.id), tx),
    )
    const { tab: tab3 } = await withTenantContext(tenantA.id, (tx) =>
      createTab(tenantA.id, staffA.id, makeInput('Tercero (se cancela)', productA.id), tx),
    )
    await withTenantContext(tenantB.id, (tx) =>
      createTab(tenantB.id, staffB.id, makeInput('De otro complejo', productB.id), tx),
    )

    await withTenantContext(tenantA.id, (tx) =>
      cancelTab(tenantA.id, staffA.id, { tabId: tab3.id, reason: 'no viene' }, tx),
    )

    const open = await withTenantContext(tenantA.id, (tx) => listOpenTabs(tenantA.id, tx))

    expect(open.map((t) => t.debtorName)).toEqual(['Primero', 'Segundo'])
    expect(open.every((t) => t.status === 'open')).toBe(true)
    expect(open.every((t) => t.tenantId === tenantA.id)).toBe(true)
    expect(open.map((t) => t.id)).not.toContain(tab3.id) // canceled: afuera
  })
})
