import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { chargeSplitPayment, type SplitCharge } from '@/modules/cashflow/cashflow.service'
import {
  DEFAULT_STREET_MONEY_WINDOW,
  streetMoneyCutoffDate,
  type StreetMoneyWindow,
} from '@/modules/cashflow/street-money-window'
import { insertAuditLog } from '@/shared/db/audit'
import {
  EmptyTicketError,
  InsufficientStockError,
  ProductInactiveError,
  ProductNotFoundError,
  TabChargeMismatchError,
  TabNotFoundError,
  TabNotOpenError,
} from './canteen.errors'
import { lockProducts, normalizeTicketLines } from './canteen-sale.service'
import type {
  CanteenSaleMethod,
  CanteenTabRow,
  CanteenTabStatus,
  TicketLineInput,
} from './canteen.types'

/**
 * Fiados ("anotáselo al capitán"). Asimetría deliberada del modelo:
 * el STOCK sale el día de la ENTREGA (createTab escribe las líneas del
 * ledger y descuenta); la PLATA entra el día del COBRO (settleTab crea el
 * cash_flow con occurred_at = ahora). Crear un fiado NO toca la caja, así
 * que está permitido con la caja del día cerrada; saldarlo no (hereda
 * assertDayOpen de createCashFlow).
 */

type TabRowRaw = {
  id: string
  tenant_id: string
  debtor_name: string
  status: CanteenTabStatus
  total_amount: number
  note: string | null
  created_by: string
  created_at: Date | string
  settled_at: Date | string | null
  settled_by: string | null
  settled_cash_flow_id: string | null
  canceled_at: Date | string | null
  canceled_by: string | null
  canceled_reason: string | null
}

function rowToTab(r: TabRowRaw): CanteenTabRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    debtorName: r.debtor_name,
    status: r.status,
    totalAmount: r.total_amount,
    note: r.note,
    createdBy: r.created_by,
    // tx.execute crudo puede devolver Date como string (gotcha del repo).
    createdAt: new Date(r.created_at),
    settledAt: r.settled_at ? new Date(r.settled_at) : null,
    settledBy: r.settled_by,
    settledCashFlowId: r.settled_cash_flow_id,
    canceledAt: r.canceled_at ? new Date(r.canceled_at) : null,
    canceledBy: r.canceled_by,
    canceledReason: r.canceled_reason,
  }
}

export type CreateTabInput = {
  debtorName: string
  lines: TicketLineInput[]
  note?: string | null
  clientIdempotencyKey: string
}

/**
 * Crea el fiado: fila en canteen_tabs + N líneas 'sale' en stock_movements
 * (agrupadas por tab_id, SIN cash_flow) + descuento de stock donde aplique.
 * Misma disciplina de locks que sellTicket: productos ORDER BY id.
 * Idempotencia propia (key única en canteen_tabs): un doble-tap devuelve
 * el fiado existente sin volver a descontar stock.
 */
export async function createTab(
  tenantId: string,
  staffUserId: string,
  input: CreateTabInput,
  tx: DbTx,
): Promise<{ tab: CanteenTabRow; duplicate: boolean }> {
  const lines = normalizeTicketLines(input.lines)
  if (lines.length === 0) throw new EmptyTicketError()

  // Fast path de reintento (pre-lock).
  const pre = await tx.execute(sql`
    SELECT * FROM canteen_tabs WHERE client_idempotency_key = ${input.clientIdempotencyKey} LIMIT 1
  `)
  const preRow = (pre as unknown as TabRowRaw[])[0]
  if (preRow) return { tab: rowToTab(preRow), duplicate: true }

  // Mismo lock que la venta cobrada (código COMPARTIDO a propósito: si el
  // camino de validación cambia, cambia para ticket y fiado a la vez).
  const products = await lockProducts(
    tenantId,
    lines.map((l) => l.productId),
    tx,
  )

  // Re-check bajo lock (misma carrera de doble-tap concurrente que sellTicket).
  const post = await tx.execute(sql`
    SELECT * FROM canteen_tabs WHERE client_idempotency_key = ${input.clientIdempotencyKey} LIMIT 1
  `)
  const postRow = (post as unknown as TabRowRaw[])[0]
  if (postRow) return { tab: rowToTab(postRow), duplicate: true }

  let total = 0
  const resolved: Array<{
    id: string
    name: string
    price: number
    stock: number | null
    qty: number
  }> = []
  for (const line of lines) {
    const product = products.get(line.productId)
    if (!product) throw new ProductNotFoundError(line.productId)
    if (!product.is_active) throw new ProductInactiveError(product.name)
    if (typeof product.stock === 'number' && product.stock < line.qty) {
      throw new InsufficientStockError(product.name, product.stock)
    }
    total += product.price * line.qty
    resolved.push({ ...product, qty: line.qty })
  }

  const tabRows = await tx.execute(sql`
    INSERT INTO canteen_tabs
      (tenant_id, debtor_name, total_amount, note, created_by, client_idempotency_key)
    VALUES
      (${tenantId}, ${input.debtorName}, ${total}, ${input.note ?? null}, ${staffUserId}, ${input.clientIdempotencyKey})
    ON CONFLICT (client_idempotency_key) WHERE client_idempotency_key IS NOT NULL DO NOTHING
    RETURNING *
  `)
  const tabRow = (tabRows as unknown as TabRowRaw[])[0]
  if (!tabRow) {
    // Perdimos una carrera que el re-check no vio (ventana mínima): tratar como duplicado.
    const existing = await tx.execute(sql`
      SELECT * FROM canteen_tabs WHERE client_idempotency_key = ${input.clientIdempotencyKey} LIMIT 1
    `)
    return { tab: rowToTab((existing as unknown as TabRowRaw[])[0]!), duplicate: true }
  }

  // Un INSERT y un UPDATE para todo el ticket, no dos por producto (mismo
  // cambio que en `canteen-sale.service.ts`).
  await tx.execute(sql`
    INSERT INTO stock_movements
      (tenant_id, product_id, kind, qty, unit_price, tab_id, created_by)
    VALUES ${sql.join(
      resolved.map(
        (p) =>
          sql`(${tenantId}, ${p.id}, 'sale', ${-p.qty}, ${p.price}, ${tabRow.id}, ${staffUserId})`,
      ),
      sql`, `,
    )}
  `)

  const tracked = resolved.filter((p) => typeof p.stock === 'number')
  if (tracked.length > 0) {
    await tx.execute(sql`
      UPDATE canteen_products p
      SET stock = p.stock - v.qty
      FROM (VALUES ${sql.join(
        tracked.map((p) => sql`(${p.id}::uuid, ${p.qty}::int)`),
        sql`, `,
      )}) AS v(product_id, qty)
      WHERE p.id = v.product_id AND p.tenant_id = ${tenantId}
    `)
  }

  return { tab: rowToTab(tabRow), duplicate: false }
}

type SettleTabCharge = { amount: number; method: CanteenSaleMethod }

export type SettleTabInput = {
  tabId: string
  /**
   * Método mixto (D2, Fase 1): 1-5 líneas que tienen que sumar EXACTO
   * `tab.totalAmount` — a diferencia de turnos/inscripciones, un fiado no
   * admite pago parcial (el ticket ya se entregó completo).
   */
  charges: SettleTabCharge[]
  clientIdempotencyKey: string
}

/**
 * Salda el fiado: uno o más cash_flow income/product_sale (occurred_at =
 * ahora → la plata entra HOY) que suman el total del ticket, partidos por
 * método si hace falta + transición open→paid. El lock es la transición
 * condicionada: FOR UPDATE + re-check de status. Idempotencia doble: la
 * transición WHERE status='open' (un segundo settle concurrente ve 'paid' y
 * corta) + la key de cada línea (chargeSplitPayment, reintento de red
 * devuelve el mismo resultado).
 */
export async function settleTab(
  tenantId: string,
  staffUserId: string,
  input: SettleTabInput,
  tx: DbTx,
): Promise<{ tab: CanteenTabRow; duplicate: boolean }> {
  const rows = await tx.execute(sql`
    SELECT * FROM canteen_tabs
    WHERE id = ${input.tabId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `)
  const tab = (rows as unknown as TabRowRaw[])[0]
  if (!tab) throw new TabNotFoundError(input.tabId)

  if (tab.status === 'paid') {
    // Reintento de un settle que ya ganó: idempotente si es la misma key.
    return { tab: rowToTab(tab), duplicate: true }
  }
  if (tab.status !== 'open') throw new TabNotOpenError(input.tabId)

  const totalCharging = input.charges.reduce((sum, c) => sum + c.amount, 0)
  if (totalCharging !== tab.total_amount) {
    throw new TabChargeMismatchError(tab.total_amount, totalCharging)
  }

  const cashFlows = await chargeSplitPayment(
    tenantId,
    staffUserId,
    input.charges as SplitCharge[],
    () => ({
      type: 'income',
      category: 'product_sale',
      description: `Fiado cobrado — ${tab.debtor_name}`,
    }),
    input.clientIdempotencyKey,
    tx,
  )

  const updated = await tx.execute(sql`
    UPDATE canteen_tabs
    SET status = 'paid',
        settled_at = now(),
        settled_by = ${staffUserId},
        settled_cash_flow_id = ${cashFlows[0]!.id}
    WHERE id = ${tab.id} AND tenant_id = ${tenantId} AND status = 'open'
    RETURNING *
  `)
  const updatedRow = (updated as unknown as TabRowRaw[])[0]
  if (!updatedRow) throw new TabNotOpenError(input.tabId)

  return { tab: rowToTab(updatedRow), duplicate: false }
}

export type CancelTabInput = {
  tabId: string
  reason: string
}

/**
 * Anula un fiado abierto: movimientos 'adjustment' compensatorios (+qty por
 * línea, devuelven el stock) + status 'canceled' + audit log. El ledger es
 * append-only: la anulación queda como par sale/adjustment, nunca se borra.
 */
export async function cancelTab(
  tenantId: string,
  staffUserId: string,
  input: CancelTabInput,
  tx: DbTx,
): Promise<CanteenTabRow> {
  const rows = await tx.execute(sql`
    SELECT * FROM canteen_tabs
    WHERE id = ${input.tabId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `)
  const tab = (rows as unknown as TabRowRaw[])[0]
  if (!tab) throw new TabNotFoundError(input.tabId)
  if (tab.status !== 'open') throw new TabNotOpenError(input.tabId)

  // Líneas originales del fiado; lock de productos en el orden global (id).
  const lineRows = await tx.execute(sql`
    SELECT sm.product_id, sm.qty, cp.stock
    FROM stock_movements sm
    JOIN canteen_products cp ON cp.id = sm.product_id
    WHERE sm.tab_id = ${tab.id} AND sm.tenant_id = ${tenantId} AND sm.kind = 'sale'
    ORDER BY sm.product_id
    FOR UPDATE OF cp
  `)

  // Las líneas 'sale' son negativas: devolver al stock es sumar su opuesto.
  // Un INSERT y un UPDATE para todas, no dos por línea.
  const lines = (
    lineRows as unknown as Array<{ product_id: string; qty: number; stock: number | null }>
  ).map((l) => ({ ...l, returnQty: -l.qty }))
  const cancelNote = `Anulación de fiado — ${input.reason}`

  if (lines.length > 0) {
    await tx.execute(sql`
      INSERT INTO stock_movements
        (tenant_id, product_id, kind, qty, note, tab_id, created_by)
      VALUES ${sql.join(
        lines.map(
          (l) =>
            sql`(${tenantId}, ${l.product_id}, 'adjustment', ${l.returnQty}, ${cancelNote}, ${tab.id}, ${staffUserId})`,
        ),
        sql`, `,
      )}
    `)

    const tracked = lines.filter((l) => typeof l.stock === 'number')
    if (tracked.length > 0) {
      await tx.execute(sql`
        UPDATE canteen_products p
        SET stock = p.stock + v.qty
        FROM (VALUES ${sql.join(
          tracked.map((l) => sql`(${l.product_id}::uuid, ${l.returnQty}::int)`),
          sql`, `,
        )}) AS v(product_id, qty)
        WHERE p.id = v.product_id AND p.tenant_id = ${tenantId}
      `)
    }
  }

  const updated = await tx.execute(sql`
    UPDATE canteen_tabs
    SET status = 'canceled',
        canceled_at = now(),
        canceled_by = ${staffUserId},
        canceled_reason = ${input.reason}
    WHERE id = ${tab.id} AND tenant_id = ${tenantId} AND status = 'open'
    RETURNING *
  `)
  const updatedRow = (updated as unknown as TabRowRaw[])[0]
  if (!updatedRow) throw new TabNotOpenError(input.tabId)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'canteen.tab_canceled',
    resourceType: 'canteen_tab',
    resourceId: tab.id,
    metadata: { reason: input.reason, totalAmount: tab.total_amount, debtorName: tab.debtor_name },
  })

  return rowToTab(updatedRow)
}

/** Fiados abiertos del tenant, más viejos primero (los que hay que perseguir). */
export async function listOpenTabs(
  tenantId: string,
  tx: DbTx,
  window: StreetMoneyWindow = DEFAULT_STREET_MONEY_WINDOW,
): Promise<CanteenTabRow[]> {
  // B11: la cota acá NO es por costo (la tabla es chica) sino por coherencia —
  // los tres orígenes de "Plata en la calle" comparten ventana, si no el rótulo
  // de la pantalla miente y el total deja de coincidir con la lista.
  const cutoff = streetMoneyCutoffDate(window, new Date())
  const dateBound = cutoff ? sql`AND created_at >= ${cutoff}::date` : sql``

  const rows = await tx.execute(sql`
    SELECT * FROM canteen_tabs
    WHERE tenant_id = ${tenantId} AND status = 'open'
      ${dateBound}
    ORDER BY created_at ASC
  `)
  return (rows as unknown as TabRowRaw[]).map(rowToTab)
}
