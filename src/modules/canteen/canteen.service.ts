import { sql, and, eq, asc } from 'drizzle-orm'
import { canteenProducts } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { ProductNotFoundError } from './canteen.errors'
import type {
  CanteenProductRow,
  CreateProductInput,
  UpdateProductInput,
} from './canteen.types'

function rowToProduct(r: typeof canteenProducts.$inferSelect): CanteenProductRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    price: r.price,
    cost: r.cost ?? null,
    stock: r.stock ?? null,
    minStock: r.minStock ?? null,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

/**
 * Catálogo del tenant. Por default solo activos (la tab Cantina vende de acá);
 * includeInactive=true para la tab Productos (el admin ve/reactiva pausados).
 * Filtro explícito por tenant_id además de RLS (defensa en profundidad:
 * en dev el pool conecta como superusuario y RLS no aplica).
 */
export async function listProducts(
  tenantId: string,
  tx: DbTx,
  opts: { includeInactive?: boolean } = {},
): Promise<CanteenProductRow[]> {
  const where = opts.includeInactive
    ? eq(canteenProducts.tenantId, tenantId)
    : and(eq(canteenProducts.tenantId, tenantId), eq(canteenProducts.isActive, true))

  const rows = await tx
    .select()
    .from(canteenProducts)
    .where(where)
    .orderBy(asc(canteenProducts.sortOrder), asc(canteenProducts.createdAt))

  return rows.map(rowToProduct)
}

export async function createProduct(
  tenantId: string,
  input: CreateProductInput,
  tx: DbTx,
): Promise<CanteenProductRow> {
  const rows = await tx
    .insert(canteenProducts)
    .values({
      tenantId,
      name: input.name,
      price: input.price,
      cost: input.cost ?? null,
      stock: input.stock ?? null,
      minStock: input.minStock ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning()

  return rowToProduct(rows[0]!)
}

/**
 * Edición de catálogo (solo admin, guard en la action). Cambiar `stock` acá
 * es habilitar/deshabilitar el control (null ↔ número) o corregir en frío
 * desde el formulario; las correcciones operativas con motivo van por
 * adjustStock (stock.service) que deja rastro en el ledger.
 */
export async function updateProduct(
  tenantId: string,
  productId: string,
  patch: UpdateProductInput,
  tx: DbTx,
): Promise<CanteenProductRow> {
  const rows = await tx
    .update(canteenProducts)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.price !== undefined && { price: patch.price }),
      ...(patch.cost !== undefined && { cost: patch.cost }),
      ...(patch.stock !== undefined && { stock: patch.stock }),
      ...(patch.minStock !== undefined && { minStock: patch.minStock }),
      ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
      ...(patch.isActive !== undefined && { isActive: patch.isActive }),
    })
    .where(and(eq(canteenProducts.id, productId), eq(canteenProducts.tenantId, tenantId)))
    .returning()

  const row = rows[0]
  if (!row) throw new ProductNotFoundError(productId)
  return rowToProduct(row)
}

/** Soft delete: el ledger referencia la fila, nunca se borra (REVOKE DELETE en 048). */
export async function deactivateProduct(
  tenantId: string,
  productId: string,
  tx: DbTx,
): Promise<CanteenProductRow> {
  return updateProduct(tenantId, productId, { isActive: false }, tx)
}

/** Cantidad de productos activos con stock en o bajo el mínimo (badge de la tab). */
export async function lowStockCount(tenantId: string, tx: DbTx): Promise<number> {
  const rows = await tx.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM canteen_products
    WHERE tenant_id = ${tenantId}
      AND is_active = true
      AND stock IS NOT NULL
      AND min_stock IS NOT NULL
      AND stock <= min_stock
  `)
  return (rows as unknown as Array<{ count: number }>)[0]?.count ?? 0
}
