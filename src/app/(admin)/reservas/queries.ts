import { sql, type SQL } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { depositCashFlowDescription } from '@/modules/bookings/booking.charges'
import type { RefundState } from './deposit-display'

export type ReservaListRow = {
  id: string
  date: string
  timeStart: string
  timeEnd: string
  status: string
  type: string
  courtName: string
  playerName: string | null
  guestName: string | null
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  /**
   * Qué dice `payments` sobre la devolución de esta reserva. NO es columna de
   * `bookings`: `deposit_status` se congela apenas la reserva pasa a un estado
   * terminal (el trigger de la migr. 070 rechaza el UPDATE), así que
   * `refunded` ahí significa "corresponde devolución", no "ya se devolvió".
   * Solo para MOSTRAR — ver `deposit-display.ts`. Opcional por el mismo motivo
   * que `endsAt`: no rompe consumidores/stories que arman la fila a mano.
   */
  refundState?: RefundState
  paymentMethod: string | null
  /**
   * Instante físico absoluto del FIN del turno (TIMESTAMPTZ, migraciones
   * 040/041) — fuente de verdad del guard "turno ya jugado" en el preview de
   * reembolso (BookingActions/QuickActions, clase de B3): backend
   * (`decideAdminRefund`) nunca reembolsa un turno terminado, ni para
   * 'complejo'. Opcional/nullable a propósito: la query siempre lo trae
   * (columna NOT NULL post-backfill), pero no rompe consumidores/stories que
   * arman un `ReservaListRow` a mano sin este campo.
   */
  endsAt?: string | null
  /**
   * Instante físico absoluto del INICIO del turno (TIMESTAMPTZ, migraciones
   * 040/041) — fuente de verdad para que QuickActions calcule si ESTA reserva
   * está dentro o fuera del plazo de cancelación (mismo criterio que
   * BookingActions.tsx/`ReservaDetail.startsAt`, cluster F bug 2). Opcional
   * por el mismo motivo que `endsAt`.
   */
  startsAt?: string | null
  /**
   * Saldo pendiente y total cobrado, en centavos. NO son columnas del SELECT:
   * los DERIVA la page con `summarizeBookingCharges` a partir de
   * `sumBookingChargesByBooking`, y solo para los turnos que pueden alarmar
   * (`completed`/`no_show`). Opcionales por el mismo motivo que
   * `startsAt`/`endsAt`: sin ellos el badge degrada al comportamiento previo en
   * vez de inventar una alarma que no puede justificar.
   */
  pending?: number | null
  totalPaid?: number | null
}

/** Rango temporal de la lista, relativo al día ART actual. */
export type ReservaScope = 'hoy' | 'proximas' | 'historial'

export type ReservaListFilters = {
  scope: ReservaScope
  /** Día actual en ART (YYYY-MM-DD) — el server lo calcula una sola vez. */
  today: string
  /** booking_status puntual, o 'canceladas' que agrupa ambos enums canceled_*. */
  status?: string
  /** Búsqueda por nombre del cliente o prefijo del número de reserva (UUID). */
  q?: string
}

function scopeCond(scope: ReservaScope, today: string): SQL {
  if (scope === 'hoy') return sql`AND b.date = ${today}::date`
  if (scope === 'proximas') return sql`AND b.date > ${today}::date`
  return sql`AND b.date < ${today}::date`
}

function statusCond(status: string | undefined): SQL {
  if (!status) return sql``
  if (status === 'canceladas') {
    return sql`AND b.status IN ('canceled_refunded', 'canceled_no_refund')`
  }
  return sql`AND b.status = ${status}::booking_status`
}

function searchCond(q: string | undefined): SQL {
  if (!q) return sql``
  // Escapamos los metacaracteres de LIKE para que "100%" o "_" busquen literal.
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`)
  const nameLike = `%${escaped}%`
  const idPrefix = `${escaped}%`
  return sql`AND (
    b.guest_name ILIKE ${nameLike}
    OR (p.first_name || ' ' || p.last_name) ILIKE ${nameLike}
    OR b.id::text ILIKE ${idPrefix}
  )`
}

/** Cuántas reservas entran en una página de la lista. */
export const RESERVAS_PAGE_SIZE = 100

export type ReservaListPage = {
  rows: ReservaListRow[]
  /** Hay al menos una fila más después de esta página. */
  hasMore: boolean
}

/**
 * Una página de la lista de reservas.
 *
 * B10 — antes esto era un `LIMIT 200` pelado, y el defecto no era el techo sino
 * el SILENCIO: `countTenantBookingsByStatus` cuenta sin techo, así que la
 * píldora podía decir "Completadas (740)" mientras la lista mostraba 200, sin
 * nada en pantalla que dijera que faltaban 540 ni forma de llegar a ellas. En
 * el scope `historial`, que crece para siempre, eso es la vista normal de
 * cualquier complejo con unos meses de uso.
 *
 * Paginación por OFFSET y no keyset, a sabiendas: el orden cambia según el
 * scope (tres `ORDER BY` distintos), y un cursor por scope serían tres
 * codificadores de cursor con tres oportunidades de perder una fila en un
 * empate. Sobre el historial de UN complejo el offset no es un problema de
 * performance, y "página 3" es además el modelo mental correcto para revisar
 * historial. El costo real del offset —que una reserva creada entre dos páginas
 * corra el borde— es intrascendente en una lista que se scrollea, no se procesa.
 *
 * `LIMIT n+1` en vez de un `COUNT` extra: alcanza para saber si hay otra página
 * y no paga una segunda pasada por la tabla.
 */
export async function listTenantBookings(
  tenantId: string,
  filters: ReservaListFilters,
  tx: DbTx,
  page = 0,
): Promise<ReservaListPage> {
  // Hoy: agrupable por cancha con horarios ascendentes. Próximas: lo más
  // cercano primero. Historial: lo más reciente primero.
  const orderBy =
    filters.scope === 'hoy'
      ? sql`ORDER BY c.name ASC, b.time_start ASC`
      : filters.scope === 'proximas'
        ? sql`ORDER BY b.date ASC, b.time_start ASC, c.name ASC`
        : sql`ORDER BY b.date DESC, b.time_start DESC, c.name ASC`
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0
  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text AS date, b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           b.status, b.type, b.price_snapshot AS "priceSnapshot",
           b.deposit_amount AS "depositAmount", b.deposit_status AS "depositStatus",
           (
             -- COUNT(*) primero y no un COALESCE afuera: un subselect con
             -- agregado SIEMPRE devuelve una fila, y bool_or sobre el conjunto
             -- vacío da NULL, que caía en el ELSE y marcaba como devuelta una
             -- reserva sin ninguna devolución.
             SELECT CASE
                      WHEN COUNT(*) = 0 THEN 'none'
                      WHEN bool_or(pr.status = 'pending') THEN 'pending'
                      ELSE 'settled'
                    END
             FROM payments pr
             WHERE pr.booking_id = b.id AND pr.type = 'refund'
               AND pr.status IN ('approved', 'pending')
           ) AS "refundState",
           b.payment_method AS "paymentMethod", b.starts_at AS "startsAt", b.ends_at AS "endsAt",
           c.name AS "courtName",
           CASE WHEN p.id IS NULL THEN NULL ELSE (p.first_name || ' ' || p.last_name) END AS "playerName",
           b.guest_name AS "guestName"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.tenant_id = ${tenantId}
      ${scopeCond(filters.scope, filters.today)}
      ${statusCond(filters.status)}
      ${searchCond(filters.q)}
    ${orderBy}
    LIMIT ${RESERVAS_PAGE_SIZE + 1} OFFSET ${safePage * RESERVAS_PAGE_SIZE}
  `)
  const list = rows as unknown as ReservaListRow[]
  const hasMore = list.length > RESERVAS_PAGE_SIZE
  return { rows: hasMore ? list.slice(0, RESERVAS_PAGE_SIZE) : list, hasMore }
}

/**
 * Contadores por estado para el scope/búsqueda actuales, SIN aplicar el filtro
 * de estado: las píldoras muestran "Confirmadas (12)" aunque estés parado en
 * "Pendientes" — si no, los números desaparecerían al filtrar.
 */
export async function countTenantBookingsByStatus(
  tenantId: string,
  filters: Omit<ReservaListFilters, 'status'>,
  tx: DbTx,
): Promise<Record<string, number>> {
  const rows = await tx.execute(sql`
    SELECT b.status, count(*)::int AS count
    FROM bookings b
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.tenant_id = ${tenantId}
      ${scopeCond(filters.scope, filters.today)}
      ${searchCond(filters.q)}
    GROUP BY b.status
  `)
  const counts: Record<string, number> = {}
  for (const r of rows as unknown as Array<{ status: string; count: number }>) {
    counts[r.status] = r.count
  }
  return counts
}

export type ReservaDetail = ReservaListRow & {
  notesPlayer: string | null
  notesInternal: string | null
  playerPhone: string | null
  guestPhone: string | null
  canceledReason: string | null
  /** Horas de anticipación de la política de cancelación del complejo (Tarea #3). */
  cancellationPolicyHours: number
  /** Tarea #4 — id del abonado si el turno es de tipo fixed (NULL en otro caso). */
  abonadoId: string | null
  /**
   * Instante físico absoluto (TIMESTAMPTZ, migraciones 040/041) — fuente de
   * verdad para el preview de plazo de cancelación en BookingActions (R3-1),
   * evita el cálculo manual con offset fijo -3 que erraba en turnos de
   * madrugada de complejos closes_next_day. Opcional/nullable a propósito:
   * `getBookingDetail` siempre lo trae (columna NOT NULL post-backfill), pero
   * BookingActions cae al cálculo manual si por algún motivo llegara ausente
   * (y así no rompe consumidores/stories que arman un `ReservaDetail` a mano
   * sin este campo).
   */
  startsAt?: string | null
  /**
   * Última modificación del turno (TIMESTAMPTZ). Para un turno en `no_show` es
   * el instante en que se marcó la ausencia: BookingActions lo usa para saber
   * si la ventana de corrección de 24h (RI #1) sigue abierta y mostrar u
   * ocultar "Deshacer ausente". Opcional por el mismo motivo que `startsAt`:
   * consumidores/stories que arman un `ReservaDetail` a mano no lo tienen.
   */
  updatedAt?: string | null
}

export async function getBookingDetail(
  tenantId: string,
  bookingId: string,
  tx: DbTx,
): Promise<ReservaDetail | null> {
  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text AS date, b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           b.status, b.type, b.price_snapshot AS "priceSnapshot",
           b.deposit_amount AS "depositAmount", b.deposit_status AS "depositStatus",
           (
             -- COUNT(*) primero y no un COALESCE afuera: un subselect con
             -- agregado SIEMPRE devuelve una fila, y bool_or sobre el conjunto
             -- vacío da NULL, que caía en el ELSE y marcaba como devuelta una
             -- reserva sin ninguna devolución.
             SELECT CASE
                      WHEN COUNT(*) = 0 THEN 'none'
                      WHEN bool_or(pr.status = 'pending') THEN 'pending'
                      ELSE 'settled'
                    END
             FROM payments pr
             WHERE pr.booking_id = b.id AND pr.type = 'refund'
               AND pr.status IN ('approved', 'pending')
           ) AS "refundState",
           b.payment_method AS "paymentMethod", b.notes_player AS "notesPlayer",
           b.notes_internal AS "notesInternal", b.guest_name AS "guestName", b.guest_phone AS "guestPhone",
           b.canceled_reason AS "canceledReason",
           COALESCE((t.settings->'cancellation_policy'->>'hours_before')::int, 24) AS "cancellationPolicyHours",
           b.abonado_id AS "abonadoId",
           b.starts_at AS "startsAt", b.ends_at AS "endsAt", b.updated_at AS "updatedAt",
           c.name AS "courtName",
           CASE WHEN p.id IS NULL THEN NULL ELSE (p.first_name || ' ' || p.last_name) END AS "playerName",
           p.phone AS "playerPhone"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.tenant_id = ${tenantId} AND b.id = ${bookingId}
    LIMIT 1
  `)
  const list = rows as unknown as ReservaDetail[]
  return list[0] ?? null
}

export type BookingChargeRow = {
  id: string
  amount: number
  method: string
  description: string
  occurredAt: string
}

export type BookingCharges = {
  charges: BookingChargeRow[]
  /** Suma de los cobros de mostrador (cash_flows income) del turno, en centavos. */
  chargesTotal: number
}

/**
 * Tarea #8 — cobros de mostrador del turno: cash_flows income vinculados al
 * booking_id. NO incluye la seña (que se trackea aparte en deposit_amount), así
 * el resumen suma seña + cobros sin doble-contar.
 *
 * ENS-21: desde que `handleApproved` (payment.service.ts) inserta un cash_flow
 * automático para la seña confirmada por MP (mismo category='booking' que un
 * cobro de mostrador, para que el reporte de caja la vea), esa fila EXISTE en
 * `cash_flows` con `booking_id` seteado — sin excluirla acá se sumaría de
 * nuevo sobre `depositCounted` (que ya la cuenta vía deposit_status) y además
 * aparecería duplicada en la lista de "cobros" de la UI. Se excluye por match
 * exacto de `description` (depositCashFlowDescription, booking.charges.ts).
 *
 * `category = 'booking'` (Fase 3): hoy es redundante — todo `createCashFlow`
 * con `bookingId` pasa esa categoría. Es el guard para la venta de cantina
 * asociada a un turno, que entra como `product_sale` con el mismo `booking_id`:
 * sin este filtro, comprarse una gaseosa bajaría el saldo pendiente del turno.
 * `sumBookingChargesByBooking` (grilla) usa el mismo predicado a propósito —
 * si uno cambia, cambian los dos o el saldo de la grilla miente respecto del
 * detalle.
 */
export async function getBookingCharges(
  tenantId: string,
  bookingId: string,
  tx: DbTx,
): Promise<BookingCharges> {
  const rows = await tx.execute(sql`
    SELECT id, amount, method, description, occurred_at::text AS "occurredAt"
    FROM cash_flows
    WHERE tenant_id = ${tenantId} AND booking_id = ${bookingId} AND type = 'income'
      AND category = 'booking'
      AND description <> ${depositCashFlowDescription(bookingId)}
    ORDER BY occurred_at ASC
  `)
  const charges = rows as unknown as BookingChargeRow[]
  const chargesTotal = charges.reduce((sum, c) => sum + c.amount, 0)
  return { charges, chargesTotal }
}

/**
 * La versión batch de `getBookingCharges` para la grilla: cobros de mostrador
 * de MUCHOS turnos en una sola query.
 *
 * La grilla necesita el saldo de cada turno del día para decidir cuáles quedaron
 * sin cobrar (la alarma de Fase 3). Llamar `getBookingCharges` por celda sería
 * un N+1 sobre la vista donde el admin vive 8h/día.
 *
 * El predicado es el MISMO que el de `getBookingCharges` (income + category
 * 'booking' + excluir la fila de la seña) — si divergen, el saldo que pinta la
 * grilla deja de coincidir con el que muestra el detalle del turno.
 *
 * Devuelve un Map en centavos; un booking sin cobros simplemente no aparece.
 */
export async function sumBookingChargesByBooking(
  tenantId: string,
  bookingIds: string[],
  tx: DbTx,
): Promise<Map<string, number>> {
  if (bookingIds.length === 0) return new Map()
  // La descripción de la seña se excluye pasándola como PARÁMETRO por booking,
  // no reconstruyendo el formato en SQL: así el literal sigue viviendo en un
  // solo lugar (depositCashFlowDescription) y cambiarlo no puede desincronizar
  // esta query en silencio.
  //
  // ANY(ARRAY[...]) con sql.join (patrón de canteen-sale/abonado.service):
  // interpolar el array de JS directo rompe con drizzle+postgres-js.
  const pairs = bookingIds.map((id) => sql`(${id}::uuid, ${depositCashFlowDescription(id)}::text)`)
  const rows = await tx.execute(sql`
    WITH wanted (booking_id, deposit_desc) AS (
      VALUES ${sql.join(pairs, sql`, `)}
    )
    SELECT cf.booking_id AS "bookingId", COALESCE(SUM(cf.amount), 0)::int AS total
    FROM cash_flows cf
    JOIN wanted w ON w.booking_id = cf.booking_id
    WHERE cf.tenant_id = ${tenantId}
      AND cf.type = 'income'
      AND cf.category = 'booking'
      AND cf.description <> w.deposit_desc
    GROUP BY cf.booking_id
  `)
  const list = rows as unknown as { bookingId: string; total: number }[]
  return new Map(list.map((r) => [r.bookingId, r.total]))
}
