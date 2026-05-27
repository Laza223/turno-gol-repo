import { sql, eq, and } from 'drizzle-orm'
import { abonados, bookings, tenants } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { ensurePTR } from '@/modules/relationships/ptr.service'
import { generateSlotDates } from './slot-generator'
import {
  AbonadoConflictError,
  AbonadoNotFoundError,
  AbonadoAlreadyCanceledError,
  ReactivationConflictError,
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

async function checkAbonadoSlotConflict(
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
  dateStr: string,
  timeStart: string,
  timeEnd: string,
  tx: DbTx,
): Promise<boolean> {
  const rows = await tx.execute(sql`
    SELECT id FROM bookings
    WHERE court_id = ${courtId}
      AND date = ${dateStr}::date
      AND status NOT IN ('canceled_refunded','canceled_no_refund')
      AND time_start < ${timeEnd}::time
      AND time_end > ${timeStart}::time
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
  const validDates: string[] = []

  for (const dateStr of slotDates) {
    const hasConflict = await checkBookingOverlap(
      abonado.courtId,
      dateStr,
      abonado.timeStart,
      abonado.timeEnd,
      tx,
    )
    if (hasConflict) {
      conflictDates.push(dateStr)
    } else {
      validDates.push(dateStr)
    }
  }

  if (validDates.length > 0) {
    await tx.insert(bookings).values(
      validDates.map((dateStr) => ({
        tenantId,
        courtId: abonado.courtId,
        playerId: abonado.playerId ?? null,
        abonadoId: abonado.id,
        date: new Date(`${dateStr}T00:00:00Z`),
        timeStart: abonado.timeStart,
        timeEnd: abonado.timeEnd,
        type: 'fixed' as const,
        status: 'confirmed' as const,
        priceSnapshot: abonado.pricePerSession,
        depositAmount: 0,
        depositStatus: 'not_required' as const,
        paymentMethod: null,
      })),
    )
  }

  return { slotsGenerated: validDates.length, conflictDates }
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
    startsOn: new Date(r.starts_on),
    endsOn: r.ends_on ? new Date(r.ends_on) : null,
    status: r.status,
    paymentMethod: r.payment_method,
    notes: r.notes,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }))
}
