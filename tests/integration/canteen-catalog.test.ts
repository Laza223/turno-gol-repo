import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { cleanupAll, createTestStaffUser, createTestTenant, ensureRoles } from '../helpers/tenant'
import {
  createProduct,
  deactivateProduct,
  listProducts,
  lowStockCount,
  updateProduct,
} from '@/modules/canteen/canteen.service'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { ProductNotFoundError, StockNotEditableFromCatalogError } from '@/modules/canteen/canteen.errors'

async function getStock(productId: string): Promise<number | null> {
  const sql = getSql()
  const rows = await sql<{ stock: number | null }[]>`
    SELECT stock FROM canteen_products WHERE id = ${productId}
  `
  return rows[0]!.stock
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('canteen catalog service', () => {
  it('creates a product with sane defaults (no cost/stock/minStock)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Agua', price: 150000 }, tx),
    )

    expect(product.name).toBe('Agua')
    expect(product.price).toBe(150000)
    expect(product.cost).toBeNull()
    expect(product.stock).toBeNull()
    expect(product.minStock).toBeNull()
    expect(product.isActive).toBe(true)
    expect(product.tenantId).toBe(tenant.id)
  })

  it('updateProduct edits the owner tenant product (control positivo de autorización)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Gaseosa', price: 200000 }, tx),
    )

    const updated = await withTenantContext(tenant.id, (tx) =>
      updateProduct(tenant.id, product.id, { price: 250000 }, tx),
    )
    expect(updated.price).toBe(250000)
    // Un patch parcial no debe pisar los campos que no vinieron.
    expect(updated.name).toBe('Gaseosa')
  })

  // Autorización — control NEGATIVO (complemento del positivo de arriba): un
  // tenant ajeno no puede tocar el producto vía el filtro explícito del
  // service (defensa en profundidad más allá de RLS — en dev/test el pool
  // conecta como superusuario y RLS no aplica; ver isolation.test.ts bloque N
  // para la cobertura de RLS real vía SET ROLE).
  it('updateProduct with a foreign tenant id throws ProductNotFoundError (control negativo)', async () => {
    const sql = getSql()
    const owner = await createTestTenant(sql)
    const intruder = await createTestTenant(sql)
    const product = await withTenantContext(owner.id, (tx) =>
      createProduct(owner.id, { name: 'Alfajor', price: 100000 }, tx),
    )

    await expect(
      withTenantContext(intruder.id, (tx) =>
        updateProduct(intruder.id, product.id, { price: 1 }, tx),
      ),
    ).rejects.toBeInstanceOf(ProductNotFoundError)

    // Y el precio real del dueño no se movió un centavo.
    const stillOwners = await withTenantContext(owner.id, (tx) => listProducts(owner.id, tx))
    expect(stillOwners.find((p) => p.id === product.id)?.price).toBe(100000)
  })

  it('deactivateProduct soft-deletes: oculto del listProducts default, visible con includeInactive', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const product = await withTenantContext(tenant.id, (tx) =>
      createProduct(tenant.id, { name: 'Chocolatada', price: 180000 }, tx),
    )

    await withTenantContext(tenant.id, (tx) => deactivateProduct(tenant.id, product.id, tx))

    const activeOnly = await withTenantContext(tenant.id, (tx) => listProducts(tenant.id, tx))
    expect(activeOnly.some((p) => p.id === product.id)).toBe(false)

    const withInactive = await withTenantContext(tenant.id, (tx) =>
      listProducts(tenant.id, tx, { includeInactive: true }),
    )
    const found = withInactive.find((p) => p.id === product.id)
    expect(found).toBeDefined()
    expect(found!.isActive).toBe(false)
  })

  it('listProducts never mixes another tenant catalog (defensa en profundidad cross-tenant)', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    await withTenantContext(tenantA.id, (tx) =>
      createProduct(tenantA.id, { name: 'Solo de A', price: 100000 }, tx),
    )
    await withTenantContext(tenantB.id, (tx) =>
      createProduct(tenantB.id, { name: 'Solo de B', price: 999000 }, tx),
    )

    const listA = await withTenantContext(tenantA.id, (tx) => listProducts(tenantA.id, tx))
    expect(listA.map((p) => p.name)).toContain('Solo de A')
    expect(listA.map((p) => p.name)).not.toContain('Solo de B')
  })

  describe('lowStockCount', () => {
    it('cuenta solo productos ACTIVOS con stock <= min_stock; ignora sin-minStock y sin-control-de-stock', async () => {
      const sql = getSql()
      const tenant = await createTestTenant(sql)

      // A: bajo mínimo, activo -> CUENTA.
      await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Bajo stock', price: 100000, stock: 2, minStock: 5 }, tx),
      )
      // B: por encima del mínimo, activo -> no cuenta.
      await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Stock sano', price: 100000, stock: 10, minStock: 5 }, tx),
      )
      // C: numéricamente bajo pero SIN minStock configurado -> no cuenta.
      await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Sin alerta configurada', price: 100000, stock: 1 }, tx),
      )
      // D: SIN control de stock (stock null) con minStock seteado -> no cuenta.
      const noControl = await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Sin control', price: 100000, minStock: 5 }, tx),
      )
      expect(noControl.stock).toBeNull()
      // E: bajo mínimo pero INACTIVO -> no cuenta.
      const inactiveLow = await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Bajo pero pausado', price: 100000, stock: 1, minStock: 5 }, tx),
      )
      await withTenantContext(tenant.id, (tx) => deactivateProduct(tenant.id, inactiveLow.id, tx))

      const count = await withTenantContext(tenant.id, (tx) => lowStockCount(tenant.id, tx))
      expect(count).toBe(1)
    })
  })

  // RI #4 D4 (fase-d4-flujos-integridad-report.md §9 punto 4): el form de
  // catálogo mandaba `stock` con el snapshot que cargó el diálogo. Si una
  // venta descontaba stock mientras el diálogo seguía abierto, guardar el
  // form PISABA el contador con el valor viejo — la venta desaparecía.
  // `updateProduct` ahora solo acepta null↔número (cambio de MODO) o el
  // mismo número (no-op); número→OTRO número se rechaza.
  describe('updateProduct — stock solo por el ledger (RI #4 D4)', () => {
    it('venta concurrente durante la edición NO pierde el descuento (escenario del bug)', async () => {
      const sql = getSql()
      const tenant = await createTestTenant(sql)
      const staff = await createTestStaffUser(sql)
      const product = await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Agua', price: 150000, stock: 10 }, tx),
      )

      // El diálogo se abre y carga el snapshot: stock = 10.
      const staleSnapshot = product.stock

      // Mientras el diálogo sigue abierto, se vende 3 unidades: stock -> 7.
      await withTenantContext(tenant.id, (tx) =>
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
      )
      expect(await getStock(product.id)).toBe(7)

      // El staff guarda el form de catálogo con el snapshot viejo (10): el
      // service tiene que rechazarlo, no pisar la venta.
      await expect(
        withTenantContext(tenant.id, (tx) =>
          updateProduct(tenant.id, product.id, { price: 160000, stock: staleSnapshot }, tx),
        ),
      ).rejects.toBeInstanceOf(StockNotEditableFromCatalogError)

      // La venta concurrente sigue en pie: NUNCA vuelve a 10.
      expect(await getStock(product.id)).toBe(7)
    })

    it('número → otro número distinto se rechaza (StockNotEditableFromCatalogError)', async () => {
      const sql = getSql()
      const tenant = await createTestTenant(sql)
      const product = await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Gaseosa', price: 200000, stock: 20 }, tx),
      )

      await expect(
        withTenantContext(tenant.id, (tx) => updateProduct(tenant.id, product.id, { stock: 15 }, tx)),
      ).rejects.toBeInstanceOf(StockNotEditableFromCatalogError)

      expect(await getStock(product.id)).toBe(20) // no tocado
    })

    it('null → número (activar control) se acepta', async () => {
      const sql = getSql()
      const tenant = await createTestTenant(sql)
      const product = await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Sin control', price: 100000 }, tx),
      )
      expect(product.stock).toBeNull()

      const updated = await withTenantContext(tenant.id, (tx) =>
        updateProduct(tenant.id, product.id, { stock: 50 }, tx),
      )
      expect(updated.stock).toBe(50)
    })

    it('número → null (desactivar control) se acepta', async () => {
      const sql = getSql()
      const tenant = await createTestTenant(sql)
      const product = await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Con control', price: 100000, stock: 30 }, tx),
      )

      const updated = await withTenantContext(tenant.id, (tx) =>
        updateProduct(tenant.id, product.id, { stock: null }, tx),
      )
      expect(updated.stock).toBeNull()
    })

    it('número → el mismo número no es un cambio: se acepta (no-op)', async () => {
      const sql = getSql()
      const tenant = await createTestTenant(sql)
      const product = await withTenantContext(tenant.id, (tx) =>
        createProduct(tenant.id, { name: 'Estable', price: 100000, stock: 12 }, tx),
      )

      const updated = await withTenantContext(tenant.id, (tx) =>
        updateProduct(tenant.id, product.id, { name: 'Estable v2', stock: 12 }, tx),
      )
      expect(updated.stock).toBe(12)
      expect(updated.name).toBe('Estable v2') // el resto del patch sí se aplica
    })
  })
})
