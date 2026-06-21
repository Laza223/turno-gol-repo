import { sql, type SQL } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

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
           b.payment_method AS "paymentMethod",
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
    ORDER BY occurred_at ASC
  `)
  const charges = rows as unknown as BookingChargeRow[]
  const chargesTotal = charges.reduce((sum, c) => sum + c.amount, 0)
  return { charges, chargesTotal }
}
