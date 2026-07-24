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
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { registerPurchase } from '@/modules/canteen/stock.service'

// Gap de recon (D4): canteen-sale.test.ts ya cubre carreras venta-vs-venta
// (misma key, distintas keys, tickets cruzados) pero no venta-vs-REPOSICIÓN
// sobre el MISMO producto. Los dos servicios bloquean la fila del producto
// (`FOR UPDATE`) y escriben el stock con UPDATEs RELATIVOS
// (`SET stock = stock - qty` / `SET stock = stock + units`), así que
// conmutan sin importar el orden en que gane el lock: 10 − 3 + 5 = 12 pase lo
// que pase. Control positivo: un lost update (leer stock, calcular el nuevo
// valor en JS y hacer un SET absoluto) daría 7 (si la venta pisa a la
// reposición) o 15 (al revés) en vez de 12 — el assert de abajo distingue
// las tres cosas.

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

async function getProductStock(productId: string): Promise<number | null> {
  const sql = getSql()
  const rows = await sql<{ stock: number | null }[]>`
    SELECT stock FROM canteen_products WHERE id = ${productId}
  `
  return rows[0]!.stock
}

describe('canteen — carrera venta vs reposición sobre el MISMO producto (Promise.all)', () => {
  it('stock=10, vender 3 en paralelo con reponer 5: stock final EXACTO 12 (updates relativos conmutan)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Gatorade', price: 150000, stock: 10 }, tx),
    )

    // Si CUALQUIERA de las dos rechazara, este await lanzaría y el test
    // fallaría acá — misma prueba implícita que usan los tests de carrera
    // "sin deadlock" de canteen-sale.test.ts.
    const [saleResult, purchaseResult] = await Promise.all([
      withTenantContext(tenant.id, (tx) =>
        sellTicket(
          tenant.id,
          staff.id,
          {
            lines: [{ productId: product.id, qty: 3 }],
            method: 'cash',
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
      withTenantContext(tenant.id, (tx) =>
        registerPurchase(
          tenant.id,
          staff.id,
          {
            productId: product.id,
            units: 5,
            // Sin `expense`: la reposición NO toca caja, así el assert de
            // cash_flows de abajo queda aislado a la venta (contrato F4).
            clientIdempotencyKey: crypto.randomUUID(),
          },
          tx,
        ),
      ),
    ])

    expect(saleResult.duplicate).toBe(false)
    expect(purchaseResult.duplicate).toBe(false)

    // Control positivo: NUNCA 7 (venta pisó reposición) ni 15 (reposición
    // pisó venta) — solo 12 prueba que los dos updates relativos conmutaron.
    expect(await getProductStock(product.id)).toBe(12)

    const movements = await sql<{ kind: string; qty: number }[]>`
      SELECT kind, qty FROM stock_movements
      WHERE tenant_id = ${tenant.id} AND product_id = ${product.id}
    `
    expect(movements).toHaveLength(2)
    const saleMove = movements.find((m) => m.kind === 'sale')
    const purchaseMove = movements.find((m) => m.kind === 'purchase')
    expect(saleMove?.qty).toBe(-3)
    expect(purchaseMove?.qty).toBe(5)

    // La venta SIEMPRE genera 1 cash_flow (income/product_sale); la
    // reposición sin `expense` no toca caja — exactamente 1 fila.
    const cashFlows = await sql<{ type: string; category: string }[]>`
      SELECT type, category FROM cash_flows WHERE tenant_id = ${tenant.id}
    `
    expect(cashFlows).toHaveLength(1)
    expect(cashFlows[0]!.type).toBe('income')
    expect(cashFlows[0]!.category).toBe('product_sale')
  })
})
