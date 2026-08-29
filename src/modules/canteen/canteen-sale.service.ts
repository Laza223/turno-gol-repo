import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import {
  EmptyTicketError,
  InsufficientStockError,
  ProductInactiveError,
  ProductNotFoundError,
  SaleBookingNotFoundError,
} from './canteen.errors'
import type { SellTicketInput, SellTicketResult, TicketLineInput } from './canteen.types'

export type LockedProduct = {
  id: string
  name: string
  price: number
  stock: number | null
  is_active: boolean
}

/** Junta líneas repetidas del mismo producto (tap-tap-tap en la UI = una línea x3). */
export function normalizeTicketLines(lines: TicketLineInput[]): TicketLineInput[] {
  const byProduct = new Map<string, number>()
  for (const line of lines) {
    byProduct.set(line.productId, (byProduct.get(line.productId) ?? 0) + line.qty)
  }
  return [...byProduct.entries()].map(([productId, qty]) => ({ productId, qty }))
}

/** Descripción legible del cash_flow: "Cantina: Agua x2, Cerveza". Tope 500 (boundedText del feed). */
export function ticketDescription(lines: Array<{ name: string; qty: number }>): string {
  const body = lines.map((l) => (l.qty === 1 ? l.name : `${l.name} x${l.qty}`)).join(', ')
  const full = `Cantina: ${body}`
  return full.length <= 500 ? full : `${full.slice(0, 499)}…`
}

/**
 * Bloquea las filas de los productos del ticket. ORDER BY id SIEMPRE:
 * dos tickets concurrentes con productos cruzados ({A,B} vs {B,A}) toman
 * los locks en el mismo orden y no pueden deadlockearse.
 * Filtro explícito por tenant_id además de RLS (defensa en profundidad).
 */
export async function lockProducts(
  tenantId: string,
  productIds: string[],
  tx: DbTx,
): Promise<Map<string, LockedProduct>> {
  // ANY(ARRAY[...]) con sql.join (patrón abonado.service): interpolar el
  // array de JS directo (`ANY(${ids}::uuid[])`) rompe con drizzle+postgres-js
  // — "malformed array literal" con 1 elemento, "cannot cast record" con 2+.
  const rows = await tx.execute(sql`
    SELECT id, name, price, stock, is_active
    FROM canteen_products
    WHERE tenant_id = ${tenantId}
      AND id = ANY(ARRAY[${sql.join(
        productIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}])
    ORDER BY id
    FOR UPDATE
  `)
  const map = new Map<string, LockedProduct>()
  for (const r of rows as unknown as LockedProduct[]) map.set(r.id, r)
  return map
}

/**
 * Venta de cantina por ticket: UN cash_flow (income/product_sale, total) +
 * N líneas en stock_movements (kind='sale', qty −, unit_price snapshot,
 * agrupadas por cash_flow_id) + descuento de canteen_products.stock solo
 * donde el producto controla stock. Todo en la MISMA transacción.
 *
 * Idempotencia (lección actions.ts Fix #55 + retry-tras-agotar-stock):
 *  1. Dup-check por clientIdempotencyKey ANTES de validar stock — un
 *     reintento de red de una venta que YA descontó el último stock debe
 *     devolver éxito, no "sin stock".
 *  2. Re-check DESPUÉS de tomar los locks de producto: dos requests
 *     concurrentes con la misma key pasan ambas el check 1 (la primera
 *     todavía no commiteó); la segunda espera el lock y acá descubre el
 *     duplicado — sin esto descontaría stock dos veces.
 *
 * El createCashFlow interno hereda assertDayOpen + advisory lock del cierre:
 * con la caja del día cerrada la venta se rechaza (DayAlreadyClosedError).
 * Orden de locks global: productos (ORDER BY id) → advisory daily_close.
 * closeDailyRegister toma solo el advisory y nunca toca canteen_products,
 * así que no hay ciclo posible.
 */
export async function sellTicket(
  tenantId: string,
  staffUserId: string,
  input: SellTicketInput,
  tx: DbTx,
): Promise<SellTicketResult> {
  const lines = normalizeTicketLines(input.lines)
  if (lines.length === 0) throw new EmptyTicketError()

  // (1) Fast path de reintento: la venta ya existe, no tocar nada.
  const preCheck = await tx.execute(sql`
    SELECT id, amount FROM cash_flows
    WHERE client_idempotency_key = ${input.clientIdempotencyKey}
    LIMIT 1
  `)
  const existing = (preCheck as unknown as Array<{ id: string; amount: number }>)[0]
  if (existing) {
    return { cashFlowId: existing.id, total: existing.amount, duplicate: true }
  }

  // Consumo cargado a un turno (panel de la grilla, Fase 3): el turno tiene que
  // existir BAJO ESTE TENANT. SELECT pelado a propósito, sin FOR UPDATE — nada
  // se valida contra el saldo del turno (la venta es product_sale, no un pago
  // de la cancha), así que tomar el lock sólo agregaría un orden nuevo
  // (booking → productos → advisory) sin comprar nada.
  //
  // Filtro explícito por tenant_id ADEMÁS de RLS, igual que `lockProducts`: el
  // FK a bookings corre con los permisos del dueño de la tabla y no ve RLS, así
  // que sin este WHERE un id de otro complejo entraría igual.
  if (input.bookingId) {
    const bookingRows = await tx.execute(sql`
      SELECT 1 FROM bookings
      WHERE id = ${input.bookingId} AND tenant_id = ${tenantId}
      LIMIT 1
    `)
    if ((bookingRows as unknown as unknown[]).length === 0) {
      throw new SaleBookingNotFoundError(input.bookingId)
    }
  }

  const products = await lockProducts(
    tenantId,
    lines.map((l) => l.productId),
    tx,
  )

  // (2) Re-check bajo lock: cierra la carrera de dos requests con la misma key.
  const postCheck = await tx.execute(sql`
    SELECT id, amount FROM cash_flows
    WHERE client_idempotency_key = ${input.clientIdempotencyKey}
    LIMIT 1
  `)
  const existingLocked = (postCheck as unknown as Array<{ id: string; amount: number }>)[0]
  if (existingLocked) {
    return { cashFlowId: existingLocked.id, total: existingLocked.amount, duplicate: true }
  }

  // Validación línea por línea: si UNA falla, falla el ticket entero (rollback
  // total en la action). Precios SIEMPRE desde DB, nunca del cliente.
  let total = 0
  const resolved: Array<{ product: LockedProduct; qty: number }> = []
  for (const line of lines) {
    const product = products.get(line.productId)
    if (!product) throw new ProductNotFoundError(line.productId)
    if (!product.is_active) throw new ProductInactiveError(product.name)
    if (typeof product.stock === 'number' && product.stock < line.qty) {
      throw new InsufficientStockError(product.name, product.stock)
    }
    total += product.price * line.qty
    resolved.push({ product, qty: line.qty })
  }

  const cashFlow = await createCashFlow(
    tenantId,
    staffUserId,
    {
      type: 'income',
      category: 'product_sale',
      amount: total,
      method: input.method,
      description: ticketDescription(resolved.map((r) => ({ name: r.product.name, qty: r.qty }))),
      clientIdempotencyKey: input.clientIdempotencyKey,
      // Etiqueta de origen, NO un pago del turno: la categoría sigue siendo
      // product_sale y todo lo que calcula saldo de reserva filtra por
      // category = 'booking' (getBookingCharges, sumBookingChargesByBooking,
      // booking.debts, reconciliación INV1/INV9).
      ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    },
    tx,
  )

  // Un INSERT y un UPDATE para todo el ticket, no dos por producto. Las
  // LECTURAS ya venían en lote (`lockProducts` usa `= ANY(ARRAY[...])`); las
  // escrituras habían quedado fila por fila, y esto corre en el camino más
  // repetido del turno de un encargado.
  await tx.execute(sql`
    INSERT INTO stock_movements
      (tenant_id, product_id, kind, qty, unit_price, cash_flow_id, created_by)
    VALUES ${sql.join(
      resolved.map(
        ({ product, qty }) =>
          sql`(${tenantId}, ${product.id}, 'sale', ${-qty}, ${product.price}, ${cashFlow.id}, ${staffUserId})`,
      ),
      sql`, `,
    )}
  `)

  // Solo los productos con stock llevado. `stock = NULL` significa "no se
  // controla", y restarle algo lo dejaría en NULL igual — pero se excluyen para
  // no tocar filas de gusto.
  const tracked = resolved.filter(({ product }) => typeof product.stock === 'number')
  if (tracked.length > 0) {
    await tx.execute(sql`
      UPDATE canteen_products p
      SET stock = p.stock - v.qty
      FROM (VALUES ${sql.join(
        tracked.map(({ product, qty }) => sql`(${product.id}::uuid, ${qty}::int)`),
        sql`, `,
      )}) AS v(product_id, qty)
      WHERE p.id = v.product_id AND p.tenant_id = ${tenantId}
    `)
  }

  return { cashFlowId: cashFlow.id, total, duplicate: false }
}
