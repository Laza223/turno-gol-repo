import { sql, eq, and } from 'drizzle-orm'
import { abonados, bookings, tenants } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { ensurePTR } from '@/modules/relationships/ptr.service'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import type { CashFlowRow, CashPaymentMethod } from '@/modules/cashflow/cashflow.types'
import { generateSlotDates } from './slot-generator'
import { slotIsPhysicallyNextDay } from '@/modules/bookings/booking.service'
import { physicalRange } from '@/shared/time/physical-range'
import {
  AbonadoConflictError,
  AbonadoNotFoundError,
  AbonadoAlreadyCanceledError,
  ReactivationConflictError,
  InsufficientCreditError,
  CreditNotApplicableError,
} from './abonado.errors'
import type { AbonadoRow, AbonadoStatus, AbonadoPaymentMethod, CreateAbonadoInput } from './abonado.types'

function rowToAbonadoRow(r: typeof abonados.$inferSelect): AbonadoRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    courtId: r.courtId,
    playerId: r.playerId ?? null,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    dayOfWeek: r.dayOfWeek,
    timeStart: r.timeStart,
    timeEnd: r.timeEnd,
    pricePerSession: r.pricePerSession,
    monthlyPrice: r.monthlyPrice,
    creditBalance: r.creditBalance,
    startsOn: r.startsOn,
    endsOn: r.endsOn ?? null,
    status: r.status,
    paymentMethod: r.paymentMethod,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function artToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

async function getClosedDates(tenantId: string, tx: DbTx): Promise<string[]> {
  const rows = await tx
    .select({ closedDates: tenants.closedDates })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return (rows[0]?.closedDates ?? []) as string[]
}

export async function checkAbonadoSlotConflict(
  courtId: string,
  dayOfWeek: number,
  timeStart: string,
  timeEnd: string,
  tenantId: string,
  excludeId: string | null,
  tx: DbTx,
): Promise<boolean> {
  const rows = await tx.execute(sql`
    SELECT id FROM abonados
    WHERE tenant_id = ${tenantId}
      AND court_id = ${courtId}
      AND day_of_week = ${dayOfWeek}
      AND time_start = ${timeStart}::time
      AND time_end = ${timeEnd}::time
      AND status = 'active'
      ${excludeId ? sql`AND id != ${excludeId}` : sql``}
    LIMIT 1
  `)
  return (rows as unknown[]).length > 0
}

async function checkBookingOverlap(
  courtId: string,
  startsAt: Date,
  endsAt: Date,
  tx: DbTx,
): Promise<boolean> {
  const rows = await tx.execute(sql`
    SELECT id FROM bookings
    WHERE court_id = ${courtId}
      AND status NOT IN ('canceled_refunded','canceled_no_refund')
      AND tstzrange(starts_at, ends_at) && tstzrange(${startsAt.toISOString()}, ${endsAt.toISOString()})
    LIMIT 1
  `)
  return (rows as unknown[]).length > 0
}

async function insertBookingsForSlots(
  slotDates: string[],
  abonado: AbonadoRow,
  tenantId: string,
  tx: DbTx,
): Promise<{ slotsGenerated: number; conflictDates: string[] }> {
  const conflictDates: string[] = []
  const validRows: Array<{ dateStr: string; startsAt: Date; endsAt: Date }> = []

  const physicallyNextDay = slotDates.length > 0
    ? await slotIsPhysicallyNextDay(tenantId, slotDates[0]!, abonado.timeStart, tx)
    : false

  for (const dateStr of slotDates) {
    const { startsAt, endsAt } = physicalRange({
      date: dateStr, timeStart: abonado.timeStart, timeEnd: abonado.timeEnd, physicallyNextDay,
    })
    const hasConflict = await checkBookingOverlap(abonado.courtId, startsAt, endsAt, tx)
    if (hasConflict) {
      conflictDates.push(dateStr)
    } else {
      validRows.push({ dateStr, startsAt, endsAt })
    }
  }

  if (validRows.length > 0) {
    await tx.insert(bookings).values(
      validRows.map(({ dateStr, startsAt, endsAt }) => ({
        tenantId,
        courtId: abonado.courtId,
        playerId: abonado.playerId ?? null,
        abonadoId: abonado.id,
        date: new Date(`${dateStr}T00:00:00Z`),
        timeStart: abonado.timeStart,
        timeEnd: abonado.timeEnd,
        startsAt,
        endsAt,
        type: 'fixed' as const,
        status: 'confirmed' as const,
        priceSnapshot: abonado.pricePerSession,
        depositAmount: 0,
        depositStatus: 'not_required' as const,
        paymentMethod: null,
      })),
    )
  }

  return { slotsGenerated: validRows.length, conflictDates }
}

export async function createAbonado(
  tenantId: string,
  staffUserId: string,
  input: CreateAbonadoInput,
  tx: DbTx,
): Promise<{ abonado: AbonadoRow; slotsGenerated: number; conflictDates: string[] }> {
  const hasConflict = await checkAbonadoSlotConflict(
    input.courtId,
    input.dayOfWeek,
    input.timeStart,
    input.timeEnd,
    tenantId,
    null,
    tx,
  )
  if (hasConflict) throw new AbonadoConflictError()

  const rows = await tx
    .insert(abonados)
    .values({
      tenantId,
      courtId: input.courtId,
      playerId: input.playerId ?? null,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      dayOfWeek: input.dayOfWeek,
      timeStart: input.timeStart,
      timeEnd: input.timeEnd,
      pricePerSession: input.pricePerSession,
      monthlyPrice: input.monthlyPrice,
      startsOn: new Date(`${input.startsOn}T00:00:00Z`),
      endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null,
      status: 'active' as const,
      paymentMethod: input.paymentMethod ?? 'cash',
      notes: input.notes ?? null,
    })
    .returning()

  const abonado = rowToAbonadoRow(rows[0]!)

  const closedDates = await getClosedDates(tenantId, tx)
  const slotDates = generateSlotDates({
    dayOfWeek: input.dayOfWeek,
    startsOn: input.startsOn,
    endsOn: input.endsOn ?? null,
    fromDate: input.startsOn,
    count: 8,
    closedDates,
  })

  const { slotsGenerated, conflictDates } = await insertBookingsForSlots(
    slotDates,
    abonado,
    tenantId,
    tx,
  )

  if (input.playerId) {
    await ensurePTR(input.playerId, tenantId, tx)
  }

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'abonado.created',
    resourceType: 'abonado',
    resourceId: abonado.id,
    metadata: { slotsGenerated, conflictDates },
  })

  return { abonado, slotsGenerated, conflictDates }
}

export async function pauseAbonado(
  tenantId: string,
  abonadoId: string,
  staffUserId: string,
  tx: DbTx,
): Promise<AbonadoRow> {
  const existing = await tx
    .select()
    .from(abonados)
    .where(and(eq(abonados.id, abonadoId), eq(abonados.tenantId, tenantId)))
    .limit(1)

  if (existing.length === 0) throw new AbonadoNotFoundError(abonadoId)
  const current = existing[0]!
  if (current.status === 'canceled') throw new AbonadoAlreadyCanceledError()
  if (current.status === 'paused') return rowToAbonadoRow(current)

  await tx.execute(sql`
    DELETE FROM bookings
    WHERE abonado_id = ${abonadoId}
      AND date >= NOW()::date
      AND status IN ('confirmed','pending_payment')
  `)

  const updated = await tx
    .update(abonados)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(abonados.id, abonadoId))
    .returning()

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'abonado.paused',
    resourceType: 'abonado',
    resourceId: abonadoId,
    metadata: {},
  })

  return rowToAbonadoRow(updated[0]!)
}

export async function reactivateAbonado(
  tenantId: string,
  abonadoId: string,
  staffUserId: string,
  tx: DbTx,
): Promise<{ abonado: AbonadoRow; slotsGenerated: number }> {
  const existing = await tx
    .select()
    .from(abonados)
    .where(and(eq(abonados.id, abonadoId), eq(abonados.tenantId, tenantId)))
    .limit(1)

  if (existing.length === 0) throw new AbonadoNotFoundError(abonadoId)
  const current = existing[0]!
  if (current.status === 'canceled') throw new AbonadoAlreadyCanceledError()
  if (current.status === 'active') return { abonado: rowToAbonadoRow(current), slotsGenerated: 0 }

  const hasConflict = await checkAbonadoSlotConflict(
    current.courtId,
    current.dayOfWeek,
    current.timeStart,
    current.timeEnd,
    tenantId,
    abonadoId,
    tx,
  )
  if (hasConflict) throw new ReactivationConflictError()

  const updated = await tx
    .update(abonados)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(abonados.id, abonadoId))
    .returning()

  const abonado = rowToAbonadoRow(updated[0]!)
  const today = artToday()
  const closedDates = await getClosedDates(tenantId, tx)

  const slotDates = generateSlotDates({
    dayOfWeek: abonado.dayOfWeek,
    startsOn: abonado.startsOn.toISOString().slice(0, 10),
    endsOn: abonado.endsOn ? abonado.endsOn.toISOString().slice(0, 10) : null,
    fromDate: today,
    count: 8,
    closedDates,
  })

  const { slotsGenerated } = await insertBookingsForSlots(slotDates, abonado, tenantId, tx)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'abonado.reactivated',
    resourceType: 'abonado',
    resourceId: abonadoId,
    metadata: { slotsGenerated },
  })

  return { abonado, slotsGenerated }
}

export async function cancelAbonado(
  tenantId: string,
  abonadoId: string,
  fromDate: string,
  staffUserId: string,
  tx: DbTx,
): Promise<AbonadoRow> {
  const existing = await tx
    .select()
    .from(abonados)
    .where(and(eq(abonados.id, abonadoId), eq(abonados.tenantId, tenantId)))
    .limit(1)

  if (existing.length === 0) throw new AbonadoNotFoundError(abonadoId)
  const current = existing[0]!
  if (current.status === 'canceled') throw new AbonadoAlreadyCanceledError()

  await tx.execute(sql`
    DELETE FROM bookings
    WHERE abonado_id = ${abonadoId}
      AND date >= ${fromDate}::date
      AND status IN ('confirmed','pending_payment')
  `)

  const updated = await tx
    .update(abonados)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(eq(abonados.id, abonadoId))
    .returning()

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'abonado.canceled',
    resourceType: 'abonado',
    resourceId: abonadoId,
    metadata: { fromDate },
  })

  return rowToAbonadoRow(updated[0]!)
}

/**
 * Returns the subset of `dates` that have at least one conflicting booking
 * (same overlap semantics as checkBookingOverlap, but does NOT abort on first hit).
 * Used by the preview action before creating an abonado.
 */
export async function getAbonadoSlotConflicts(
  tenantId: string,
  courtId: string,
  timeStart: string,
  timeEnd: string,
  dates: string[],
  tx: DbTx,
): Promise<string[]> {
  if (dates.length === 0) return []

  // Build a single query: for each date check if there is a conflicting booking.
  // We use ANY(ARRAY[...]) to avoid N+1. tenant context is already set via SET LOCAL.
  const rows = await tx.execute(sql`
    SELECT DISTINCT date::text AS date_str
    FROM bookings
    WHERE court_id = ${courtId}
      AND date = ANY(ARRAY[${sql.join(
        dates.map((d) => sql`${d}::date`),
        sql`, `,
      )}])
      AND status NOT IN ('canceled_refunded','canceled_no_refund')
      AND time_start < ${timeEnd}::time
      AND time_end > ${timeStart}::time
  `)

  const conflictSet = new Set(
    (rows as unknown as Array<{ date_str: string }>).map((r) => r.date_str),
  )
  return dates.filter((d) => conflictSet.has(d)).sort()
}

export async function getAbonados(
  tenantId: string,
  filters: { status?: AbonadoStatus },
  tx: DbTx,
): Promise<AbonadoRow[]> {
  const rows = await tx.execute(sql`
    SELECT * FROM abonados
    WHERE tenant_id = ${tenantId}
    ${filters.status ? sql`AND status = ${filters.status}` : sql``}
    ORDER BY day_of_week, time_start
  `)

  return (rows as unknown as Array<{
    id: string
    tenant_id: string
    court_id: string
    player_id: string | null
    contact_name: string
    contact_phone: string
    day_of_week: number
    time_start: string
    time_end: string
    price_per_session: number
    monthly_price: number
    credit_balance: number
    starts_on: Date
    ends_on: Date | null
    status: AbonadoStatus
    payment_method: AbonadoPaymentMethod
    notes: string | null
    created_at: Date
    updated_at: Date
  }>).map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    courtId: r.court_id,
    playerId: r.player_id,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    dayOfWeek: r.day_of_week,
    timeStart: r.time_start,
    timeEnd: r.time_end,
    pricePerSession: r.price_per_session,
    monthlyPrice: r.monthly_price,
    creditBalance: r.credit_balance,
    startsOn: new Date(r.starts_on),
    endsOn: r.ends_on ? new Date(r.ends_on) : null,
    status: r.status,
    paymentMethod: r.payment_method,
    notes: r.notes,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }))
}

async function getAbonadoInTenant(
  tenantId: string,
  abonadoId: string,
  tx: DbTx,
): Promise<AbonadoRow> {
  const rows = await tx
    .select()
    .from(abonados)
    .where(and(eq(abonados.id, abonadoId), eq(abonados.tenantId, tenantId)))
    .limit(1)
  if (rows.length === 0) throw new AbonadoNotFoundError(abonadoId)
  return rowToAbonadoRow(rows[0]!)
}

/**
 * Toma un lock de fila sobre el abonado (SELECT … FOR UPDATE) para serializar
 * las operaciones que mutan credit_balance (carga + descuento). Sin esto, dos
 * transacciones concurrentes sobre el mismo abonado pueden pisar el recompute
 * (lost update) o sobre-gastar el saldo. Debe llamarse dentro de withTenantContext
 * (transacción abierta). Lanza AbonadoNotFoundError si no existe en el tenant.
 */
async function lockAbonado(tenantId: string, abonadoId: string, tx: DbTx): Promise<void> {
  const rows = await tx.execute(sql`
    SELECT id FROM abonados
    WHERE id = ${abonadoId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `)
  if ((rows as unknown[]).length === 0) throw new AbonadoNotFoundError(abonadoId)
}

/**
 * Recalcula credit_balance del abonado desde sus fuentes (idempotente):
 *   credit_balance = SUM(cash_flows abonado_payment) - SUM(bookings.credit_applied)
 * GREATEST(0, …) protege el CHECK chk_abonado_credit_non_negative. Llamarlo tras
 * cargar saldo o descontar una sesión deja el saldo siempre consistente, sin
 * importar reintentos de red (doble-submit con la misma idempotency key no
 * vuelve a sumar porque el CashFlow es único por clave).
 */
async function recomputeAbonadoCredit(
  tenantId: string,
  abonadoId: string,
  tx: DbTx,
): Promise<number> {
  const rows = await tx.execute(sql`
    UPDATE abonados a
    SET credit_balance = GREATEST(0,
      COALESCE((
        SELECT SUM(cf.amount) FROM cash_flows cf
        WHERE cf.abonado_id = a.id AND cf.category = 'abonado_payment'
      ), 0)
      - COALESCE((
        SELECT SUM(b.credit_applied) FROM bookings b WHERE b.abonado_id = a.id
      ), 0)
    ),
    updated_at = NOW()
    WHERE a.id = ${abonadoId} AND a.tenant_id = ${tenantId}
    RETURNING credit_balance
  `)
  const updated = (rows as unknown as Array<{ credit_balance: number }>)[0]
  return updated ? Number(updated.credit_balance) : 0
}

export type LoadAbonadoCreditInput = {
  abonadoId: string
  amount: number
  method: CashPaymentMethod
  note?: string
  clientIdempotencyKey?: string
}

/**
 * Tarea #4 — Carga de saldo a favor de un abonado (modelo ATC). El complejo
 * recibe plata por adelantado → genera un CashFlow income/abonado_payment
 * vinculado al abonado (entra a la caja del día) y acredita el saldo. El saldo
 * se recalcula desde las fuentes para ser idempotente ante reintentos.
 */
export async function loadAbonadoCredit(
  tenantId: string,
  staffUserId: string,
  input: LoadAbonadoCreditInput,
  tx: DbTx,
): Promise<{ abonado: AbonadoRow; cashFlow: CashFlowRow }> {
  // Serializa cargas/descuentos concurrentes sobre este abonado antes de tocar
  // el saldo (el recompute es un re-sum: sin lock, dos cargas se pisan).
  await lockAbonado(tenantId, input.abonadoId, tx)

  const cashFlow = await createCashFlow(
    tenantId,
    staffUserId,
    {
      type: 'income',
      category: 'abonado_payment',
      amount: input.amount,
      method: input.method,
      description: input.note?.trim() ? input.note.trim() : 'Carga de saldo (abonado)',
      abonadoId: input.abonadoId,
      clientIdempotencyKey: input.clientIdempotencyKey,
    },
    tx,
  )

  await recomputeAbonadoCredit(tenantId, input.abonadoId, tx)
  const abonado = await getAbonadoInTenant(tenantId, input.abonadoId, tx)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'abonado.credit_loaded',
    resourceType: 'abonado',
    resourceId: input.abonadoId,
    metadata: { amount: input.amount, method: input.method, cashFlowId: cashFlow.id },
  })

  return { abonado, cashFlow }
}

/**
 * Tarea #4 — Descuento semanal MANUAL ("Mantener saldo"). Sobre una instancia
 * de turno fijo (booking type='fixed', status='confirmed'):
 *   - keepBalance=false → descuenta price_snapshot del saldo del abonado
 *     (setea bookings.credit_applied; NO genera CashFlow: la plata ya entró al
 *     cargar el saldo).
 *   - keepBalance=true  → revierte el descuento (credit_applied → 0).
 * Idempotente: aplicar dos veces no descuenta de más; revertir sin descuento
 * previo es no-op.
 */
export async function setBookingAbonadoCredit(
  tenantId: string,
  staffUserId: string,
  bookingId: string,
  keepBalance: boolean,
  tx: DbTx,
): Promise<{ creditApplied: number; abonado: AbonadoRow }> {
  const bookingRows = await tx.execute(sql`
    SELECT type::text AS type, status::text AS status, abonado_id AS "abonadoId",
           price_snapshot AS "priceSnapshot", credit_applied AS "creditApplied"
    FROM bookings
    WHERE id = ${bookingId} AND tenant_id = ${tenantId}
    LIMIT 1
  `)
  const booking = (bookingRows as unknown as Array<{
    type: string
    status: string
    abonadoId: string | null
    priceSnapshot: number
    creditApplied: number
  }>)[0]

  if (!booking || booking.type !== 'fixed' || !booking.abonadoId || booking.status !== 'confirmed') {
    throw new CreditNotApplicableError()
  }

  const abonadoId = booking.abonadoId
  // Lock del abonado: serializa descuentos concurrentes sobre el mismo saldo
  // (dos turnos del mismo abonado tildados a la vez no deben sobre-gastar).
  await lockAbonado(tenantId, abonadoId, tx)

  if (!keepBalance) {
    // Aplicar descuento. Si ya estaba aplicado, no-op idempotente.
    if (booking.creditApplied === 0) {
      const abonado = await getAbonadoInTenant(tenantId, abonadoId, tx)
      if (abonado.creditBalance < booking.priceSnapshot) {
        throw new InsufficientCreditError()
      }
      await tx.execute(sql`
        UPDATE bookings SET credit_applied = ${booking.priceSnapshot}, updated_at = NOW()
        WHERE id = ${bookingId} AND tenant_id = ${tenantId}
      `)
    }
  } else {
    // Revertir descuento. Si no había, no-op.
    if (booking.creditApplied > 0) {
      await tx.execute(sql`
        UPDATE bookings SET credit_applied = 0, updated_at = NOW()
        WHERE id = ${bookingId} AND tenant_id = ${tenantId}
      `)
    }
  }

  await recomputeAbonadoCredit(tenantId, abonadoId, tx)
  const abonado = await getAbonadoInTenant(tenantId, abonadoId, tx)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: keepBalance ? 'abonado.credit_reverted' : 'abonado.credit_applied',
    resourceType: 'booking',
    resourceId: bookingId,
    metadata: { abonadoId, amount: booking.priceSnapshot },
  })

  return { creditApplied: keepBalance ? 0 : booking.priceSnapshot, abonado }
}
