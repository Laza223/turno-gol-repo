import { sql, type SQL } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { depositCashFlowDescription } from '@/modules/bookings/booking.charges'

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

export async function listTenantBookings(
  tenantId: string,
  filters: ReservaListFilters,
  tx: DbTx,
): Promise<ReservaListRow[]> {
  // Hoy: agrupable por cancha con horarios ascendentes. Próximas: lo más
  // cercano primero. Historial: lo más reciente primero.
  const orderBy =
    filters.scope === 'hoy'
      ? sql`ORDER BY c.name ASC, b.time_start ASC`
      : filters.scope === 'proximas'
        ? sql`ORDER BY b.date ASC, b.time_start ASC, c.name ASC`
        : sql`ORDER BY b.date DESC, b.time_start DESC, c.name ASC`
  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text AS date, b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           b.status, b.type, b.price_snapshot AS "priceSnapshot",
           b.deposit_amount AS "depositAmount", b.deposit_status AS "depositStatus",
           b.payment_method AS "paymentMethod", b.ends_at AS "endsAt",
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
    LIMIT 200
  `)
  return rows as unknown as ReservaListRow[]
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
      AND description <> ${depositCashFlowDescription(bookingId)}
    ORDER BY occurred_at ASC
  `)
  const charges = rows as unknown as BookingChargeRow[]
  const chargesTotal = charges.reduce((sum, c) => sum + c.amount, 0)
  return { charges, chargesTotal }
}
