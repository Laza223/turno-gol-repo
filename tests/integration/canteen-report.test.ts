/**
 * Integration — canteen-report.service.ts (Fase 7, reporte de cantina).
 *
 * Dos fuentes deliberadamente asimétricas (ver comentario del service):
 *  - getSalesRanking: ledger stock_movements kind='sale' — cuenta por día de
 *    ENTREGA e incluye fiados aún no cobrados ("qué se vendió").
 *  - getCanteenTotalsByMethod / getCanteenDailyTotals: cash_flows
 *    category='product_sale' — solo lo COBRADO ("qué entró a la caja").
 *
 * cutoffMins=0 en todos los calls: ningún tenant de este archivo tiene
 * closes_next_day=true, así que el bucketing sigue siendo el calendario ART
 * de siempre (docs/decisions/2026-07-24-caja-cantina-dia-operativo.md); el
 * caso closes_next_day=true vive en canteen-report-operating-day.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { cleanupAll, createTestStaffUser, createTestTenant, ensureRoles, linkStaffToTenant } from '../helpers/tenant'
import { createProduct } from '@/modules/canteen/canteen.service'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { cancelTab, createTab, settleTab } from '@/modules/canteen/canteen-tab.service'
import {
  getCanteenDailyTotals,
  getCanteenTotalsByMethod,
  getSalesRanking,
} from '@/modules/canteen/canteen-report.service'
import { todayART } from '@/shared/time/art-date'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

/** Suma días a una fecha "YYYY-MM-DD" (aritmética UTC pura). Copia local de
 * caja-lib.ts: los tests de integration no importan código de src/app. */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function last7(): { from: string; to: string } {
  const to = todayART()
  return { from: addDays(to, -6), to }
}

function last30(): { from: string; to: string } {
  const to = todayART()
  return { from: addDays(to, -29), to }
}

describe('canteen report — getSalesRanking', () => {
  it('suma unidades de venta cobrada + fiado abierto del mismo producto; revenue por unit_price snapshot; orden revenue DESC', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    // productX: 2 cobradas (cash) + 3 fiadas (sin cobrar) del mismo producto.
    const productX = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Agua', price: 100000, stock: 20 }, tx),
    )
    await withTenantContext(tenant.id, (tx) =>
      sellTicket(
        tenant.id,
        staff.id,
        { lines: [{ productId: productX.id, qty: 2 }], method: 'cash', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )
    await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Fiado sin cobrar',
          lines: [{ productId: productX.id, qty: 3 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    // productY: 1 venta cobrada, menor revenue total — para probar el ORDER BY.
    const productY = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Alfajor', price: 100000, stock: 20 }, tx),
    )
    await withTenantContext(tenant.id, (tx) =>
      sellTicket(
        tenant.id,
        staff.id,
        { lines: [{ productId: productY.id, qty: 1 }], method: 'cash', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    const ranking = await withTenantContext(tenant.id, (tx) => getSalesRanking(tenant.id, tx, last7(), 0))

    expect(ranking).toHaveLength(2)
    // productX suma AMBOS orígenes (venta + fiado): 2 + 3 = 5 unidades.
    expect(ranking[0]!.productId).toBe(productX.id)
    expect(ranking[0]!.units).toBe(5)
    expect(ranking[0]!.revenue).toBe(5 * 100000)
    // Orden revenue DESC: productX (500000) antes que productY (100000).
    expect(ranking[1]!.productId).toBe(productY.id)
    expect(ranking[1]!.units).toBe(1)
    expect(ranking[1]!.revenue).toBe(100000)
  })

  it('agrupa por día de ENTREGA: un movimiento de hace 10 días queda FUERA del rango 7 y DENTRO del 30', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Gaseosa vieja', price: 120000, stock: 20 }, tx),
    )
    // Fiado (tab_id, sin cash_flow) — más simple que un cash_flow real para
    // simular un movimiento con occurred_at custom respetando los CHECKs
    // (chk_sale_has_price / chk_sale_has_parent) sin escribir el INSERT crudo.
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Hace 10 días',
          lines: [{ productId: product.id, qty: 4 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600_000).toISOString()
    await sql`UPDATE stock_movements SET occurred_at = ${tenDaysAgo} WHERE tab_id = ${tab.id}`

    const ranking7 = await withTenantContext(tenant.id, (tx) => getSalesRanking(tenant.id, tx, last7(), 0))
    expect(ranking7.find((r) => r.productId === product.id)).toBeUndefined()

    const ranking30 = await withTenantContext(tenant.id, (tx) => getSalesRanking(tenant.id, tx, last30(), 0))
    const row30 = ranking30.find((r) => r.productId === product.id)
    expect(row30).toBeDefined()
    expect(row30!.units).toBe(4)
    expect(row30!.revenue).toBe(4 * 120000)
  })

  it('un fiado ANULADO no cuenta en el ranking (hallazgo rojo del panel de Fase 7)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Fiado errado', price: 100000, stock: 20 }, tx),
    )
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        {
          debtorName: 'Cargado por error',
          lines: [{ productId: product.id, qty: 5 }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )
    // Antes de anular, el fiado abierto SÍ cuenta (es lo entregado).
    const before = await withTenantContext(tenant.id, (tx) => getSalesRanking(tenant.id, tx, last7(), 0))
    expect(before.find((r) => r.productId === product.id)?.units).toBe(5)

    await withTenantContext(tenant.id, (tx) =>
      cancelTab(tenant.id, staff.id, { tabId: tab.id, reason: 'cargado mal' }, tx),
    )

    // Anulado: el stock volvió (adjustment) y las líneas 'sale' quedan en el
    // ledger, pero el ranking NO debe contarlas — no hubo venta.
    const after = await withTenantContext(tenant.id, (tx) => getSalesRanking(tenant.id, tx, last7(), 0))
    expect(after.find((r) => r.productId === product.id)).toBeUndefined()

    // Una venta directa (tab_id NULL) del mismo producto sigue contando normal.
    await withTenantContext(tenant.id, (tx) =>
      sellTicket(
        tenant.id,
        staff.id,
        {
          lines: [{ productId: product.id, qty: 2 }],
          method: 'cash',
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )
    const withSale = await withTenantContext(tenant.id, (tx) => getSalesRanking(tenant.id, tx, last7(), 0))
    expect(withSale.find((r) => r.productId === product.id)?.units).toBe(2)
  })
})

describe('canteen report — getCanteenTotalsByMethod', () => {
  it('solo lo COBRADO: el fiado abierto no aparece; venta cash + venta transfer dan dos filas; settlear un fiado suma al método del cobro', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Cerveza', price: 150000, stock: 30 }, tx),
    )
    await withTenantContext(tenant.id, (tx) =>
      sellTicket(
        tenant.id,
        staff.id,
        { lines: [{ productId: product.id, qty: 2 }], method: 'cash', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )
    await withTenantContext(tenant.id, (tx) =>
      sellTicket(
        tenant.id,
        staff.id,
        { lines: [{ productId: product.id, qty: 1 }], method: 'transfer', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        { debtorName: 'Fiado sin cobrar', lines: [{ productId: product.id, qty: 3 }], clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    const beforeSettle = await withTenantContext(tenant.id, (tx) => getCanteenTotalsByMethod(tenant.id, tx, last7(), 0))
    expect(beforeSettle).toHaveLength(2)
    const cashBefore = beforeSettle.find((m) => m.method === 'cash')
    const transferBefore = beforeSettle.find((m) => m.method === 'transfer')
    expect(cashBefore?.total).toBe(2 * 150000)
    expect(transferBefore?.total).toBe(1 * 150000)
    expect(beforeSettle.find((m) => m.method === 'mercadopago')).toBeUndefined()

    // Saldar el fiado en MercadoPago: ahora sí entra a la caja, bajo ESE método.
    await withTenantContext(tenant.id, (tx) =>
      settleTab(tenant.id, staff.id, { tabId: tab.id, method: 'mercadopago', clientIdempotencyKey: crypto.randomUUID() }, tx),
    )

    const afterSettle = await withTenantContext(tenant.id, (tx) => getCanteenTotalsByMethod(tenant.id, tx, last7(), 0))
    expect(afterSettle).toHaveLength(3)
    const mp = afterSettle.find((m) => m.method === 'mercadopago')
    expect(mp?.total).toBe(3 * 150000)
    // Los otros dos métodos no cambiaron.
    expect(afterSettle.find((m) => m.method === 'cash')?.total).toBe(2 * 150000)
    expect(afterSettle.find((m) => m.method === 'transfer')?.total).toBe(1 * 150000)
  })
})

describe('canteen report — getCanteenDailyTotals', () => {
  it('agrupa por día ART; un fiado abierto hace 5 días pero saldado HOY cuenta el día del COBRO, no el de la entrega', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Papas', price: 90000, stock: 30 }, tx),
    )
    const { tab } = await withTenantContext(tenant.id, (tx) =>
      createTab(
        tenant.id,
        staff.id,
        { debtorName: 'Entregado hace 5 días', lines: [{ productId: product.id, qty: 2 }], clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600_000).toISOString()
    // Backdatear la ENTREGA (created_at del tab + occurred_at del ledger): la
    // daily total NO debe usar esta fecha, solo la del cash_flow del cobro.
    await sql`UPDATE canteen_tabs SET created_at = ${fiveDaysAgo} WHERE id = ${tab.id}`
    await sql`UPDATE stock_movements SET occurred_at = ${fiveDaysAgo} WHERE tab_id = ${tab.id}`

    // Otra venta cobrada HOY mismo, en efectivo, para sumar al total de hoy.
    await withTenantContext(tenant.id, (tx) =>
      sellTicket(
        tenant.id,
        staff.id,
        { lines: [{ productId: product.id, qty: 1 }], method: 'cash', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )
    // Saldar el fiado HOY (el cash_flow del cobro se registra con occurred_at = ahora).
    await withTenantContext(tenant.id, (tx) =>
      settleTab(tenant.id, staff.id, { tabId: tab.id, method: 'cash', clientIdempotencyKey: crypto.randomUUID() }, tx),
    )

    const daily = await withTenantContext(tenant.id, (tx) => getCanteenDailyTotals(tenant.id, tx, last7(), 0))

    const today = todayART()
    const fiveDaysAgoArt = addDays(today, -5)

    const todayRow = daily.find((d) => d.day === today)
    expect(todayRow).toBeDefined()
    // Venta de hoy (1 x 90000) + fiado saldado hoy (2 x 90000) = 270000.
    expect(todayRow!.total).toBe(1 * 90000 + 2 * 90000)

    // El día de la ENTREGA (hace 5 días) no tiene ningún cash_flow: no aparece.
    expect(daily.find((d) => d.day === fiveDaysAgoArt)).toBeUndefined()
  })
})

describe('canteen report — aislamiento cross-tenant', () => {
  it('un tenant sin ventas propias no ve nada del otro en ninguno de los 3 reportes', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const staffA = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantA.id, staffA.id)

    const product = await withTenantContext(tenantA.id, (tx) =>
      createProduct(tenantA.id, { name: 'De tenant A', price: 100000, stock: 20 }, tx),
    )
    await withTenantContext(tenantA.id, (tx) =>
      sellTicket(
        tenantA.id,
        staffA.id,
        { lines: [{ productId: product.id, qty: 2 }], method: 'cash', clientIdempotencyKey: crypto.randomUUID() },
        tx,
      ),
    )

    const rangeAll = { from: '2000-01-01', to: '2100-01-01' }
    const rankingB = await withTenantContext(tenantB.id, (tx) => getSalesRanking(tenantB.id, tx, rangeAll, 0))
    const byMethodB = await withTenantContext(tenantB.id, (tx) => getCanteenTotalsByMethod(tenantB.id, tx, rangeAll, 0))
    const dailyB = await withTenantContext(tenantB.id, (tx) => getCanteenDailyTotals(tenantB.id, tx, rangeAll, 0))

    expect(rankingB).toEqual([])
    expect(byMethodB).toEqual([])
    expect(dailyB).toEqual([])

    // Control positivo: tenantA sí ve su propia venta en el mismo rango.
    const rankingA = await withTenantContext(tenantA.id, (tx) => getSalesRanking(tenantA.id, tx, rangeAll, 0))
    expect(rankingA).toHaveLength(1)
  })
})
