/**
 * Integration — canteen-report.service.ts bajo cutoff nocturno (día operativo).
 * Migración: docs/decisions/2026-07-24-caja-cantina-dia-operativo.md.
 * canteen-report.test.ts cubre el caso normal (cutoffMins=0 implícito); acá se
 * cubre closes_next_day=true (condición 4 del ADR) y la regresión cero para
 * cutoffMins=0 explícito.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { cleanupAll, createTestStaffUser, createTestTenant, ensureRoles } from '../helpers/tenant'
import { createProduct } from '@/modules/canteen/canteen.service'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import {
  getCanteenDailyTotals,
  getCanteenTotalsByMethod,
  getSalesRanking,
} from '@/modules/canteen/canteen-report.service'
import { nightCutoffMins } from '@/shared/time/operating-day'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

// Mismo patrón que booking-physical-overlap.test.ts: abre 20:00, cierra 02:00
// todos los días → nightCutoffMins da 120 (2hs post-medianoche).
const NIGHT_HOURS = {
  mon: { open: '20:00', close: '02:00' },
  tue: { open: '20:00', close: '02:00' },
  wed: { open: '20:00', close: '02:00' },
  thu: { open: '20:00', close: '02:00' },
  fri: { open: '20:00', close: '02:00' },
  sat: { open: '20:00', close: '02:00' },
  sun: { open: '20:00', close: '02:00' },
}
const NIGHT_CUTOFF = nightCutoffMins(NIGHT_HOURS, true)

// 2026-06-19 es viernes calendario, 2026-06-20 es sábado calendario.
const FRIDAY = '2026-06-19'
const SATURDAY = '2026-06-20'
// 01:00 ART del sábado calendario = 04:00 UTC. Con cutoff 120 (corte a las
// 02:00 ART) cae DENTRO de la ventana nocturna → día operativo viernes.
const SALE_AT = new Date('2026-06-20T04:00:00.000Z')
const SALE_AMOUNT = 500000

async function seedTenantAndProduct(nightMode: boolean) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  if (nightMode) {
    await sql`
      UPDATE tenants SET closes_next_day = true, opening_hours = ${sql.json(NIGHT_HOURS)}
      WHERE id = ${tenant.id}
    `
  }
  const product = await withTenantContext(tenant.id, (tx) =>
    createProduct(tenant.id, { name: 'Cerveza', price: SALE_AMOUNT, stock: 50 }, tx),
  )
  return { tenant, staff, product }
}

/**
 * Venta directa (cash_flow + línea sale en stock_movements) con occurred_at
 * explícito — sellTicket no expone ese lever (siempre `now()`), así que se
 * arma a mano igual que el ticket real (mismo shape que canteen-sale.service).
 */
async function seedSaleAt(tenantId: string, staffId: string, productId: string, occurredAt: Date) {
  return withTenantContext(tenantId, async (tx) => {
    const cashFlow = await createCashFlow(
      tenantId,
      staffId,
      {
        type: 'income',
        category: 'product_sale',
        amount: SALE_AMOUNT,
        method: 'cash',
        description: 'Cantina: venta de madrugada (test)',
        occurredAt,
      },
      tx,
    )
    await tx.execute(drizzleSql`
      INSERT INTO stock_movements
        (tenant_id, product_id, kind, qty, unit_price, cash_flow_id, created_by, occurred_at)
      VALUES
        (${tenantId}, ${productId}, 'sale', -1, ${SALE_AMOUNT}, ${cashFlow.id}, ${staffId}, ${occurredAt.toISOString()})
    `)
    return cashFlow
  })
}

describe('canteen report — cutoff nocturno (closes_next_day=true)', () => {
  it('sanity: NIGHT_HOURS (20:00–02:00 todos los días) da cutoff de 120 minutos', () => {
    expect(NIGHT_CUTOFF).toBe(120)
  })

  it('getSalesRanking atribuye la venta de madrugada al día operativo viernes, no al sábado calendario', async () => {
    const { tenant, staff, product } = await seedTenantAndProduct(true)
    await seedSaleAt(tenant.id, staff.id, product.id, SALE_AT)

    const friday = await withTenantContext(tenant.id, (tx) =>
      getSalesRanking(tenant.id, tx, { from: FRIDAY, to: FRIDAY }, NIGHT_CUTOFF),
    )
    expect(friday).toHaveLength(1)
    expect(friday[0]!.productId).toBe(product.id)
    expect(friday[0]!.units).toBe(1)
    expect(friday[0]!.revenue).toBe(SALE_AMOUNT)

    const saturday = await withTenantContext(tenant.id, (tx) =>
      getSalesRanking(tenant.id, tx, { from: SATURDAY, to: SATURDAY }, NIGHT_CUTOFF),
    )
    expect(saturday).toEqual([])
  })

  it('getCanteenTotalsByMethod atribuye la plata cobrada al día operativo viernes', async () => {
    const { tenant, staff, product } = await seedTenantAndProduct(true)
    await seedSaleAt(tenant.id, staff.id, product.id, SALE_AT)

    const friday = await withTenantContext(tenant.id, (tx) =>
      getCanteenTotalsByMethod(tenant.id, tx, { from: FRIDAY, to: FRIDAY }, NIGHT_CUTOFF),
    )
    expect(friday).toEqual([{ method: 'cash', total: SALE_AMOUNT }])

    const saturday = await withTenantContext(tenant.id, (tx) =>
      getCanteenTotalsByMethod(tenant.id, tx, { from: SATURDAY, to: SATURDAY }, NIGHT_CUTOFF),
    )
    expect(saturday).toEqual([])
  })

  it('getCanteenDailyTotals etiqueta la fila con el día operativo viernes, no el calendario sábado', async () => {
    const { tenant, staff, product } = await seedTenantAndProduct(true)
    await seedSaleAt(tenant.id, staff.id, product.id, SALE_AT)

    const daily = await withTenantContext(tenant.id, (tx) =>
      getCanteenDailyTotals(tenant.id, tx, { from: FRIDAY, to: SATURDAY }, NIGHT_CUTOFF),
    )
    expect(daily).toEqual([{ day: FRIDAY, total: SALE_AMOUNT }])
  })
})

describe('canteen report — cutoffMins=0 (regresión cero, tenants normales)', () => {
  it('la misma venta de madrugada, con cutoffMins=0, se atribuye al calendario ART (sábado) — comportamiento actual sin cambios', async () => {
    const { tenant, staff, product } = await seedTenantAndProduct(false)
    await seedSaleAt(tenant.id, staff.id, product.id, SALE_AT)

    const friday = await withTenantContext(tenant.id, (tx) =>
      getSalesRanking(tenant.id, tx, { from: FRIDAY, to: FRIDAY }, 0),
    )
    expect(friday).toEqual([])

    const saturday = await withTenantContext(tenant.id, (tx) =>
      getSalesRanking(tenant.id, tx, { from: SATURDAY, to: SATURDAY }, 0),
    )
    expect(saturday).toHaveLength(1)
    expect(saturday[0]!.units).toBe(1)
    expect(saturday[0]!.revenue).toBe(SALE_AMOUNT)

    const daily = await withTenantContext(tenant.id, (tx) =>
      getCanteenDailyTotals(tenant.id, tx, { from: FRIDAY, to: SATURDAY }, 0),
    )
    expect(daily).toEqual([{ day: SATURDAY, total: SALE_AMOUNT }])

    const byMethod = await withTenantContext(tenant.id, (tx) =>
      getCanteenTotalsByMethod(tenant.id, tx, { from: SATURDAY, to: SATURDAY }, 0),
    )
    expect(byMethod).toEqual([{ method: 'cash', total: SALE_AMOUNT }])
  })
})
