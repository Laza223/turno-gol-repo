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
  SaleBookingNotFoundError,
  TabBookingInvalidError,
  TabChargeMismatchError,
  TabNotFoundError,
  TabNotOpenError,
} from './canteen.errors'
import { lockProducts, normalizeTicketLines } from './canteen-sale.service'
import type {
  BookingConsumo,
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
  booking_id: string | null
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
    bookingId: r.booking_id,
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
  /** Fiado de una persona. Se ignora si viene `bookingId`: ahí el nombre lo arma el servidor. */
  debtorName?: string
  /** Consumo anotado a este turno (migr. 115): se cobra junto con la cancha. */
  bookingId?: string
  lines: TicketLineInput[]
  note?: string | null
  clientIdempotencyKey: string
}

/** Estados en los que un turno admite consumos: los mismos en los que se le puede cobrar. */
const TAB_BOOKING_STATUSES = ['confirmed', 'completed']

/** Tope de `canteen_tabs.debtor_name` (el mismo del schema Zod). */
const DEBTOR_NAME_MAX = 80
/** Cómo empieza el nombre de un consumo anotado a un turno (decisión del dueño, 2026-11-17). */
const BOOKING_TAB_LABEL_PREFIX = 'Consumo de turno · '

/**
 * El nombre con el que queda anotado un consumo de turno: cancha y hora ("Cancha 3
 * · 21:00"). Sale del turno y no del cliente, así que no hay texto libre sobre
 * personas (Ley 25.326) y un id de otro complejo no puede colarse.
 *
 * SELECT pelado, sin FOR UPDATE, a propósito: nada se valida contra el saldo del
 * turno, y tomar el lock sumaría un orden nuevo (booking → productos → advisory)
 * sin comprar nada. Filtro por tenant_id además de RLS: el FK de `booking_id` corre
 * con los permisos del dueño de la tabla y no ve RLS.
 */
async function bookingTabLabel(tenantId: string, bookingId: string, tx: DbTx): Promise<string> {
  const rows = await tx.execute(sql`
    SELECT b.status, b.type, c.name AS court_name, to_char(b.time_start, 'HH24:MI') AS hhmm
    FROM bookings b
    JOIN courts c ON c.id = b.court_id AND c.tenant_id = b.tenant_id
    WHERE b.id = ${bookingId} AND b.tenant_id = ${tenantId}
    LIMIT 1
  `)
  const booking = (
    rows as unknown as Array<{ status: string; type: string; court_name: string; hhmm: string }>
  )[0]
  if (!booking) throw new SaleBookingNotFoundError(bookingId)
  if (
    booking.type === 'block' ||
    booking.type === 'tournament' ||
    !TAB_BOOKING_STATUSES.includes(booking.status)
  ) {
    throw new TabBookingInvalidError(bookingId)
  }
  // El nombre largo de una cancha se recorta ANTES de la hora: lo que hay que poder leer en
  // Caja › Cuentas es qué turno fue.
  const head = BOOKING_TAB_LABEL_PREFIX
  const tail = ` · ${booking.hhmm}`
  return `${head}${booking.court_name.slice(0, DEBTOR_NAME_MAX - head.length - tail.length)}${tail}`
}

/**
 * Crea el fiado: fila en canteen_tabs + N líneas 'sale' en stock_movements
 * (agrupadas por tab_id, SIN cash_flow) + descuento de stock donde aplique.
 * Misma disciplina de locks que sellTicket: productos ORDER BY id.
 * Idempotencia propia (key única en canteen_tabs): un doble-tap devuelve
 * el fiado existente sin volver a descontar stock.
 *
 * Con `bookingId` es un consumo anotado a un turno (migr. 115): mismo registro, más
 * el vínculo, y el nombre lo arma `bookingTabLabel`.
 */
export async function createTab(
  tenantId: string,
  staffUserId: string,
  input: CreateTabInput,
  tx: DbTx,
): Promise<{ tab: CanteenTabRow; duplicate: boolean }> {
  const lines = normalizeTicketLines(input.lines)
  if (lines.length === 0) throw new EmptyTicketError()

  // Fast path de reintento (pre-lock). El índice único de
  // client_idempotency_key es GLOBAL (migr. 048), sin tenant_id: filtro
  // explícito SIEMPRE además de RLS (defensa en profundidad, CLAUDE.md).
  const pre = await tx.execute(sql`
    SELECT * FROM canteen_tabs
    WHERE tenant_id = ${tenantId} AND client_idempotency_key = ${input.clientIdempotencyKey}
    LIMIT 1
  `)
  const preRow = (pre as unknown as TabRowRaw[])[0]
  if (preRow) return { tab: rowToTab(preRow), duplicate: true }

  // El nombre, antes de tomar locks: si el turno no sirve se corta sin tocar stock.
  const bookingId = input.bookingId ?? null
  const debtorName = bookingId
    ? await bookingTabLabel(tenantId, bookingId, tx)
    : (input.debtorName ?? '')

  // Mismo lock que la venta cobrada (código COMPARTIDO a propósito: si el
  // camino de validación cambia, cambia para ticket y fiado a la vez).
  const products = await lockProducts(
    tenantId,
    lines.map((l) => l.productId),
    tx,
  )

  // Re-check bajo lock (misma carrera de doble-tap concurrente que sellTicket).
  const post = await tx.execute(sql`
    SELECT * FROM canteen_tabs
    WHERE tenant_id = ${tenantId} AND client_idempotency_key = ${input.clientIdempotencyKey}
    LIMIT 1
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
      (tenant_id, debtor_name, booking_id, total_amount, note, created_by, client_idempotency_key)
    VALUES
      (${tenantId}, ${debtorName}, ${bookingId}, ${total}, ${input.note ?? null}, ${staffUserId}, ${input.clientIdempotencyKey})
    ON CONFLICT (client_idempotency_key) WHERE client_idempotency_key IS NOT NULL DO NOTHING
    RETURNING *
  `)
  const tabRow = (tabRows as unknown as TabRowRaw[])[0]
  if (!tabRow) {
    // Perdimos una carrera que el re-check no vio (ventana mínima): tratar como duplicado.
    const existing = await tx.execute(sql`
      SELECT * FROM canteen_tabs
      WHERE tenant_id = ${tenantId} AND client_idempotency_key = ${input.clientIdempotencyKey}
      LIMIT 1
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
      // El libro (`caja/cuentas/ledger.ts`) distingue por este prefijo: "Fiado
      // cobrado" va como fiado; un consumo de turno ya trae su rótulo completo
      // ("Consumo de turno · Cancha 3 · 21:00") y es cantina cobrada con la cancha.
      description: tab.booking_id ? tab.debtor_name : `Fiado cobrado — ${tab.debtor_name}`,
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

/**
 * Los consumos anotados y todavía sin cobrar de UN turno, uno por tanda (cada vez
 * que se anotó algo), con sus ítems — lo que el modal de cobro avisa y suma.
 * Los ítems salen del ledger de stock (`stock_movements` 'sale' con el `tab_id`).
 * Filtro por tenant_id además de RLS, como el resto de las lecturas crudas.
 */
export async function listOpenTabsForBooking(
  tenantId: string,
  bookingId: string,
  tx: DbTx,
): Promise<BookingConsumo[]> {
  const rows = await tx.execute(sql`
    SELECT t.id AS tab_id, t.total_amount, p.name AS product_name, (-sm.qty) AS qty
    FROM canteen_tabs t
    JOIN stock_movements sm
      ON sm.tab_id = t.id AND sm.tenant_id = t.tenant_id AND sm.kind = 'sale'
    JOIN canteen_products p ON p.id = sm.product_id AND p.tenant_id = t.tenant_id
    WHERE t.tenant_id = ${tenantId}
      AND t.booking_id = ${bookingId}
      AND t.status = 'open'
    ORDER BY t.created_at, t.id, p.name
  `)
  const byTab = new Map<string, BookingConsumo>()
  for (const r of rows as unknown as Array<{
    tab_id: string
    total_amount: number
    product_name: string
    qty: number
  }>) {
    const consumo = byTab.get(r.tab_id) ?? {
      tabId: r.tab_id,
      totalAmount: r.total_amount,
      items: [],
    }
    consumo.items.push({ name: r.product_name, qty: Number(r.qty) })
    byTab.set(r.tab_id, consumo)
  }
  return [...byTab.values()]
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
