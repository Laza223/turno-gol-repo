import { sql, eq, and } from 'drizzle-orm'
import { abonados, bookings, tenants } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { ensurePTR } from '@/modules/relationships/ptr.service'
import { getCourtById } from '@/modules/courts/court.service'
import { generateSlotDates } from './slot-generator'
import { isExclusionViolation, slotIsPhysicallyNextDay } from '@/modules/bookings/booking.service'
import { physicalRange } from '@/shared/time/physical-range'
import {
  AbonadoConflictError,
  AbonadoNotFoundError,
  AbonadoAlreadyCanceledError,
  ReactivationConflictError,
  CourtNotFoundError,
} from './abonado.errors'
import type {
  AbonadoRow,
  AbonadoStatus,
  AbonadoPaymentMethod,
  CreateAbonadoInput,
} from './abonado.types'

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
    startsOn: r.startsOn,
    endsOn: r.endsOn ?? null,
    status: r.status,
    paymentMethod: r.paymentMethod,
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

/**
 * SELECT ... FOR UPDATE sobre la fila de la cancha: serializa transacciones
 * concurrentes que van a insertar bookings para este court. Mismo mecanismo
 * que `lockCourtOrThrow` (booking.service.ts) usa en createManualBooking/
 * createOnlineBooking, pero SIN su chequeo de status==='online' — los
 * abonados nunca lo exigieron (una cancha offline en mantenimiento no impide
 * dar de alta un turno fijo a futuro) y ampliar esa regla no es parte de este
 * fix. Cierra en el origen la ventana de carrera entre createAbonado/
 * reactivateAbonado concurrentes (o contra createManualBooking/
 * createOnlineBooking) sobre la misma cancha: mientras el lock está tomado,
 * ninguna otra transacción puede insertar un booking que el
 * checkBookingOverlap optimista de abajo todavía no vio.
 */
async function lockCourtRow(courtId: string, tx: DbTx): Promise<void> {
  await tx.execute(sql`SELECT id FROM courts WHERE id = ${courtId} FOR UPDATE`)
}

async function insertBookingsForSlots(
  slotDates: string[],
  abonado: AbonadoRow,
  tenantId: string,
  tx: DbTx,
): Promise<{ slotsGenerated: number; conflictDates: string[] }> {
  const conflictDates: string[] = []
  const validRows: Array<{ dateStr: string; startsAt: Date; endsAt: Date }> = []

  const physicallyNextDay =
    slotDates.length > 0
      ? await slotIsPhysicallyNextDay(tenantId, slotDates[0]!, abonado.timeStart, tx)
      : false

  for (const dateStr of slotDates) {
    const { startsAt, endsAt } = physicalRange({
      date: dateStr,
      timeStart: abonado.timeStart,
      timeEnd: abonado.timeEnd,
      physicallyNextDay,
    })
    const hasConflict = await checkBookingOverlap(abonado.courtId, startsAt, endsAt, tx)
    if (hasConflict) {
      conflictDates.push(dateStr)
    } else {
      validRows.push({ dateStr, startsAt, endsAt })
    }
  }

  if (validRows.length === 0) {
    return { slotsGenerated: 0, conflictDates }
  }

  const rowFor = ({ dateStr, startsAt, endsAt }: (typeof validRows)[number]) => ({
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
  })

  try {
    // Bajo savepoint (tx.transaction anidado = SAVEPOINT en postgres-js): si el
    // exclusion constraint revienta, un ROLLBACK TO SAVEPOINT deja la
    // transacción externa sana para el fallback de abajo. Un catch sin
    // savepoint la dejaría abortada ("current transaction is aborted") para
    // cualquier query posterior, incluida la del fallback.
    await tx.transaction(async (tx2) => {
      await tx2.insert(bookings).values(validRows.map(rowFor))
    })
    return { slotsGenerated: validRows.length, conflictDates }
  } catch (err) {
    if (!isExclusionViolation(err)) throw err
    // Otro proceso ganó alguno de estos slots entre el checkBookingOverlap
    // optimista de arriba y este INSERT (misma carrera que
    // createManualBooking/createOnlineBooking cierran con
    // isExclusionViolation) — el batch entero abortó en Postgres. Reintentar
    // fila por fila, cada una en su propio savepoint, para no perder las
    // fechas que sí eran válidas: la que revienta con 23P01 pasa a
    // conflictDates, las demás se insertan igual.
    let slotsGenerated = 0
    for (const candidate of validRows) {
      try {
        await tx.transaction(async (tx2) => {
          await tx2.insert(bookings).values(rowFor(candidate))
        })
        slotsGenerated++
      } catch (rowErr) {
        if (!isExclusionViolation(rowErr)) throw rowErr
        conflictDates.push(candidate.dateStr)
      }
    }
    return { slotsGenerated, conflictDates }
  }
}

export async function createAbonado(
  tenantId: string,
  staffUserId: string,
  input: CreateAbonadoInput,
  tx: DbTx,
): Promise<{ abonado: AbonadoRow; slotsGenerated: number; conflictDates: string[] }> {
  // El courtId lo manda el cliente: sin este chequeo, un staff de otro tenant
  // podría crear un abonado (y 8 semanas de bookings confirmados) contra una
  // cancha ajena. getCourtById ya filtra por tenant_id en la query.
  const court = await getCourtById(input.courtId, tenantId, tx)
  if (!court) throw new CourtNotFoundError(input.courtId)

  // Cierra la ventana de carrera con OTRA createAbonado/reactivateAbonado (o
  // con createManualBooking/createOnlineBooking) concurrente sobre la misma
  // cancha: ver lockCourtRow arriba.
  await lockCourtRow(input.courtId, tx)

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
      startsOn: new Date(`${input.startsOn}T00:00:00Z`),
      endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null,
      status: 'active' as const,
      paymentMethod: input.paymentMethod ?? 'cash',
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

  // NOW()::date trunca en UTC (la sesión de Postgres no tiene SET TIME ZONE a
  // ART): entre las 21:00 y 23:59 ART ya es "mañana" en UTC, y el DELETE con
  // "date >= mañana" deja viva la reserva de bookings.date=hoy. artToday()
  // (mismo cálculo que cancelAbonado hace con `fromDate` explícito) da la
  // fecha operativa ART correcta.
  const today = artToday()

  await tx.execute(sql`
    DELETE FROM bookings
    WHERE abonado_id = ${abonadoId}
      AND date >= ${today}::date
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

  // Cierra la ventana de carrera con OTRA createAbonado/reactivateAbonado (o
  // con createManualBooking/createOnlineBooking) concurrente sobre la misma
  // cancha: ver lockCourtRow arriba.
  await lockCourtRow(current.courtId, tx)

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

/**
 * Los turnos fijos del complejo.
 *
 * B10 — **sin `LIMIT`, y a propósito**. El total que muestra la pantalla sale de
 * `.length` sobre estas mismas filas, así que el número nunca puede contradecir
 * a la lista: no es la clase "la UI miente" que se cerró en `/reservas` y
 * `/jugadores`. El conjunto además está acotado por la capacidad física del
 * complejo (una fila por slot semanal por cancha) más los `canceled` que se
 * acumulan, y la pantalla ya filtra por estado. Paginar acá sería ceremonia.
 *
 * Lo que sí se arregló es el `SELECT *`: el cast prometía una forma exacta de
 * fila que la query no garantizaba. Nombrar las columnas convierte un renombre
 * o un DROP en un error de Postgres —ruidoso, en el deploy— en vez de un campo
 * `undefined` con tipo no-nullable llegando a la UI. `abonados.notes` se dropeó
 * en la 074 y este `SELECT *` no se enteró; la próxima puede no ser tan barata.
 */
export async function getAbonados(
  tenantId: string,
  filters: { status?: AbonadoStatus },
  tx: DbTx,
): Promise<AbonadoRow[]> {
  const rows = await tx.execute<{
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
    // B8: `date`/`timestamptz` por `tx.execute` llegan STRING, no Date (tabla de
    // tipos en `src/shared/db/client.ts`). El `new Date(...)` de abajo ya era
    // correcto; los tipos eran los que mentían.
    starts_on: string
    ends_on: string | null
    status: AbonadoStatus
    payment_method: AbonadoPaymentMethod
    created_at: string
    updated_at: string
  }>(sql`
    SELECT id, tenant_id, court_id, player_id, contact_name, contact_phone,
           day_of_week, time_start, time_end, price_per_session,
           starts_on, ends_on, status, payment_method, created_at, updated_at
    FROM abonados
    WHERE tenant_id = ${tenantId}
    ${filters.status ? sql`AND status = ${filters.status}` : sql``}
    ORDER BY day_of_week, time_start
  `)

  return [...rows].map((r) => ({
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
    startsOn: new Date(r.starts_on),
    endsOn: r.ends_on ? new Date(r.ends_on) : null,
    status: r.status,
    paymentMethod: r.payment_method,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }))
}
