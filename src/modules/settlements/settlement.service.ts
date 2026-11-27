import { and, eq, sql } from 'drizzle-orm'
import { bookingSettlements } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import {
  chargeSplitPayment,
  resolveIdempotentCharges,
  type SplitCharge,
} from '@/modules/cashflow/cashflow.service'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { formatYearMonthEs, resolveMonthlyCoverageBounds } from '@/lib/month-bounds'
import {
  SettlementConflictError,
  SettlementNotFoundError,
  SettlementValidationError,
} from './settlement.errors'
import type {
  AbonadoBillingMode,
  AbonadoCoverageSummary,
  SettleAbonadoPeriodInput,
  SettleBookingsBatchInput,
  SettlementOutcome,
  SettlementRow,
} from './settlement.types'

type SettlementRawRow = {
  id: string
  tenant_id: string
  abonado_id: string | null
  court_id: string | null
  kind: 'pack' | 'monthly' | 'bookings'
  payment_origin: 'caja' | 'already_settled'
  amount: number
  credits_total: number | null
  period_start: string | null
  period_end: string | null
  created_by_staff: string
  voided_at: string | null
  voided_by_staff: string | null
  created_at: string
}

function rawToSettlementRow(r: SettlementRawRow): SettlementRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    abonadoId: r.abonado_id,
    courtId: r.court_id,
    kind: r.kind,
    paymentOrigin: r.payment_origin,
    amount: r.amount,
    creditsTotal: r.credits_total,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    createdByStaff: r.created_by_staff,
    voidedAt: r.voided_at ? new Date(r.voided_at) : null,
    voidedByStaff: r.voided_by_staff,
    createdAt: new Date(r.created_at),
  }
}

function rowToSettlementRow(r: typeof bookingSettlements.$inferSelect): SettlementRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    abonadoId: r.abonadoId ?? null,
    courtId: r.courtId ?? null,
    kind: r.kind as SettlementRow['kind'],
    paymentOrigin: r.paymentOrigin as SettlementRow['paymentOrigin'],
    amount: r.amount,
    creditsTotal: r.creditsTotal ?? null,
    periodStart: r.periodStart ? r.periodStart.toISOString().slice(0, 10) : null,
    periodEnd: r.periodEnd ? r.periodEnd.toISOString().slice(0, 10) : null,
    createdByStaff: r.createdByStaff,
    voidedAt: r.voidedAt ?? null,
    voidedByStaff: r.voidedByStaff ?? null,
    createdAt: r.createdAt,
  }
}

async function enableBookingSettlementUpdate(tx: DbTx): Promise<void> {
  // SET LOCAL acotado a la transacción actual para destrabar únicamente
  // `settlement_id` sobre bookings `completed` en `enforce_booking_invariants_fn`.
  await tx.execute(sql`SET LOCAL app.booking_settlement = 'on'`)
}

function assertChargesMatchTotal(
  paymentOrigin: 'caja' | 'already_settled',
  amount: number,
  charges: readonly SplitCharge[] | undefined,
): SplitCharge[] {
  if (paymentOrigin === 'already_settled') return []
  const list = charges ?? []
  if (amount <= 0 || list.length === 0) {
    throw new SettlementValidationError('Ingresá un monto mayor a $ 0 y al menos un método.')
  }
  const sum = list.reduce((acc, c) => acc + c.amount, 0)
  if (sum !== amount) {
    throw new SettlementValidationError('La suma de los cobros no coincide con el total.')
  }
  return [...list]
}

async function findReplayOutcome(
  tenantId: string,
  clientIdempotencyKey: string,
  tx: DbTx,
): Promise<SettlementOutcome | null> {
  const firstLineKey = `${clientIdempotencyKey}-0`
  const cfRows = (await tx.execute(sql`
    SELECT settlement_id AS "settlementId"
    FROM cash_flows
    WHERE tenant_id = ${tenantId}
      AND client_idempotency_key = ${firstLineKey}
      AND settlement_id IS NOT NULL
    LIMIT 1
  `)) as unknown as Array<{ settlementId: string | null }>

  const settlementId = cfRows[0]?.settlementId
  if (!settlementId) return null

  const sRows = (await tx.execute(sql`
    SELECT id, tenant_id, abonado_id, court_id, kind, payment_origin, amount,
           credits_total, period_start::text AS period_start, period_end::text AS period_end,
           created_by_staff, voided_at, voided_by_staff, created_at
    FROM booking_settlements
    WHERE id = ${settlementId} AND tenant_id = ${tenantId}
    LIMIT 1
  `)) as unknown as SettlementRawRow[]

  const row = sRows[0]
  if (!row) return null

  const covered = (await tx.execute(sql`
    SELECT id FROM bookings
    WHERE tenant_id = ${tenantId} AND settlement_id = ${settlementId}
    ORDER BY starts_at ASC
  `)) as unknown as Array<{ id: string }>

  return {
    settlement: rawToSettlementRow(row),
    coveredBookingIds: covered.map((b) => b.id),
  }
}

async function linkBookingsToSettlement(
  tenantId: string,
  bookingIds: readonly string[],
  settlementId: string,
  tx: DbTx,
): Promise<string[]> {
  if (bookingIds.length === 0) return []
  await enableBookingSettlementUpdate(tx)
  const idList = sql.join(
    bookingIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const updated = (await tx.execute(sql`
    UPDATE bookings
    SET settlement_id = ${settlementId}
    WHERE tenant_id = ${tenantId}
      AND id IN (${idList})
      AND status IN ('confirmed', 'completed')
      AND settlement_id IS NULL
    RETURNING id
  `)) as unknown as Array<{ id: string }>
  return updated.map((r) => r.id)
}

/**
 * Cubre automáticamente los turnos `confirmed` sin saldar de un abonado que caen
 * dentro de períodos mensuales o packs con créditos disponibles.
 * Lo invocan: creación de abonado, worker rodante diario y rebalanceo por cancelación.
 */
export async function assignSettlementCoverageForAbonado(
  tenantId: string,
  abonadoId: string,
  tx: DbTx,
): Promise<string[]> {
  const abonadoRows = (await tx.execute(sql`
    SELECT id, status
    FROM abonados
    WHERE id = ${abonadoId} AND tenant_id = ${tenantId}
    LIMIT 1
  `)) as unknown as Array<{ id: string; status: string }>
  const abonado = abonadoRows[0]
  if (!abonado || abonado.status !== 'active') return []

  // Turnos futuros/vigentes elegibles sin cobertura ni cobro directo previo.
  const openSlots = (await tx.execute(sql`
    SELECT b.id, b.date::text AS date, b.starts_at
    FROM bookings b
    WHERE b.tenant_id = ${tenantId}
      AND b.abonado_id = ${abonadoId}
      AND b.status = 'confirmed'
      AND b.settlement_id IS NULL
      AND b.deposit_status NOT IN ('paid', 'captured')
      AND NOT EXISTS (
        SELECT 1 FROM cash_flows cf
        WHERE cf.booking_id = b.id
          AND cf.tenant_id = b.tenant_id
          AND cf.type = 'income'
          AND cf.category = 'booking'
      )
      AND NOT EXISTS (SELECT 1 FROM booking_write_offs w WHERE w.booking_id = b.id)
    ORDER BY b.starts_at ASC, b.id ASC
    FOR UPDATE OF b
  `)) as unknown as Array<{ id: string; date: string }>

  if (openSlots.length === 0) return []

  const settlements = (await tx.execute(sql`
    SELECT bs.id, bs.kind, bs.credits_total,
           bs.period_start::text AS period_start,
           bs.period_end::text AS period_end,
           COUNT(b.id) FILTER (WHERE b.status IN ('confirmed', 'completed', 'no_show'))::int AS used_count
    FROM booking_settlements bs
    LEFT JOIN bookings b ON b.settlement_id = bs.id AND b.tenant_id = bs.tenant_id
    WHERE bs.tenant_id = ${tenantId}
      AND bs.abonado_id = ${abonadoId}
      AND bs.voided_at IS NULL
      AND bs.kind IN ('monthly', 'pack')
    GROUP BY bs.id
    ORDER BY bs.created_at ASC, bs.id ASC
  `)) as unknown as Array<{
    id: string
    kind: 'monthly' | 'pack'
    credits_total: number | null
    period_start: string | null
    period_end: string | null
    used_count: number
  }>

  if (settlements.length === 0) return []

  const assignmentsBySettlement = new Map<string, string[]>()
  const monthlyList = settlements.filter((s) => s.kind === 'monthly')
  const packList = settlements
    .filter((s) => s.kind === 'pack' && (s.credits_total ?? 0) > s.used_count)
    .map((s) => ({ id: s.id, remaining: (s.credits_total ?? 0) - s.used_count }))

  for (const slot of openSlots) {
    const monthly = monthlyList.find(
      (m) =>
        m.period_start && m.period_end && slot.date >= m.period_start && slot.date <= m.period_end,
    )
    if (monthly) {
      const list = assignmentsBySettlement.get(monthly.id) ?? []
      list.push(slot.id)
      assignmentsBySettlement.set(monthly.id, list)
      continue
    }

    const pack = packList.find((p) => p.remaining > 0)
    if (pack) {
      pack.remaining -= 1
      const list = assignmentsBySettlement.get(pack.id) ?? []
      list.push(slot.id)
      assignmentsBySettlement.set(pack.id, list)
    }
  }

  const assigned: string[] = []
  for (const [settlementId, ids] of assignmentsBySettlement) {
    const linked = await linkBookingsToSettlement(tenantId, ids, settlementId, tx)
    assigned.push(...linked)
  }
  return assigned
}

/**
 * Cuando se cancela un turno cubierto por un pack (`kind = 'pack'`), traslada el
 * crédito liberado al próximo turno confirmado disponible de la serie.
 */
export async function rebalanceAbonadoPackCoverage(
  tenantId: string,
  abonadoId: string,
  tx: DbTx,
): Promise<string[]> {
  return assignSettlementCoverageForAbonado(tenantId, abonadoId, tx)
}

/**
 * Registra un acuerdo pago en Caja o marcado como "Ya estaba saldado" para un turno fijo
 * (por mes calendario o por pack de N turnos).
 */
export async function settleAbonadoPeriod(
  tenantId: string,
  staffUserId: string,
  input: SettleAbonadoPeriodInput,
  tx: DbTx,
): Promise<SettlementOutcome> {
  const splitCharges = assertChargesMatchTotal(input.paymentOrigin, input.amount, input.charges)

  if (input.paymentOrigin === 'caja' && input.clientIdempotencyKey) {
    const idempotent = await resolveIdempotentCharges(
      tenantId,
      splitCharges,
      input.clientIdempotencyKey,
      tx,
    )
    if (!idempotent.ok) {
      throw new SettlementConflictError(idempotent.error)
    }
    if (idempotent.newChargingCents === 0) {
      const replay = await findReplayOutcome(tenantId, input.clientIdempotencyKey, tx)
      if (replay) return replay
    }
  }

  // Lock sobre abonados primero para serializar compras/modificaciones concurrentes.
  const abonadoRows = (await tx.execute(sql`
    SELECT id, court_id, contact_name, status, billing_mode
    FROM abonados
    WHERE id = ${input.abonadoId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `)) as unknown as Array<{
    id: string
    court_id: string
    contact_name: string
    status: string
    billing_mode: string
  }>
  const abonado = abonadoRows[0]
  if (!abonado) {
    throw new SettlementValidationError('No se encontró el turno fijo.')
  }
  if (abonado.status === 'canceled') {
    throw new SettlementConflictError('Este turno fijo está cancelado.')
  }

  let periodStart: string | null = null
  let periodEnd: string | null = null
  let creditsTotal: number | null = null
  let ledgerLabel: string

  if (input.kind === 'monthly') {
    if (!input.month) throw new SettlementValidationError('Elegí el mes a cubrir.')
    const bounds = resolveMonthlyCoverageBounds(input.month, input.startsFromDate)
    periodStart = bounds.periodStart
    periodEnd = bounds.periodEnd

    const overlapping = (await tx.execute(sql`
      SELECT id FROM booking_settlements
      WHERE tenant_id = ${tenantId}
        AND abonado_id = ${abonado.id}
        AND kind = 'monthly'
        AND voided_at IS NULL
        AND period_start <= ${periodEnd}::date
        AND period_end >= ${periodStart}::date
      LIMIT 1
    `)) as unknown as Array<{ id: string }>
    if (overlapping.length > 0) {
      throw new SettlementConflictError('Ese mes ya está cubierto para este turno fijo.')
    }
    ledgerLabel = `Abono mensual ${formatYearMonthEs(input.month)}`
  } else {
    if (!input.creditsTotal || input.creditsTotal < 1) {
      throw new SettlementValidationError('Indicá cuántos turnos cubre el pack.')
    }
    creditsTotal = input.creditsTotal
    ledgerLabel = creditsTotal === 1 ? 'Pack de 1 turno' : `Pack de ${creditsTotal} turnos`
  }

  const inserted = await tx
    .insert(bookingSettlements)
    .values({
      tenantId,
      abonadoId: abonado.id,
      courtId: abonado.court_id,
      kind: input.kind,
      paymentOrigin: input.paymentOrigin,
      amount: input.amount,
      creditsTotal,
      periodStart: periodStart ? new Date(`${periodStart}T00:00:00Z`) : null,
      periodEnd: periodEnd ? new Date(`${periodEnd}T00:00:00Z`) : null,
      createdByStaff: staffUserId,
    })
    .returning()

  const settlement = rowToSettlementRow(inserted[0]!)

  if (input.paymentOrigin === 'caja') {
    await chargeSplitPayment(
      tenantId,
      staffUserId,
      splitCharges,
      (_c, i) => ({
        type: 'income',
        category: 'booking',
        description:
          splitCharges.length === 1
            ? ledgerLabel
            : `${ledgerLabel} (${i + 1}/${splitCharges.length})`,
        settlementId: settlement.id,
      }),
      input.clientIdempotencyKey,
      tx,
    )
  }

  // Vinculamos turnos confirmados o ya terminados aún sin cubrir ni cobrar aparte.
  const dateFilter =
    input.kind === 'monthly' && periodStart && periodEnd
      ? sql`AND b.date >= ${periodStart}::date AND b.date <= ${periodEnd}::date`
      : sql``
  const limitClause =
    input.kind === 'pack' && creditsTotal != null ? sql`LIMIT ${creditsTotal}` : sql``

  const eligibleRows = (await tx.execute(sql`
    SELECT b.id
    FROM bookings b
    WHERE b.tenant_id = ${tenantId}
      AND b.abonado_id = ${abonado.id}
      AND b.status IN ('confirmed', 'completed')
      AND b.settlement_id IS NULL
      AND b.deposit_status NOT IN ('paid', 'captured')
      AND NOT EXISTS (
        SELECT 1 FROM cash_flows cf
        WHERE cf.booking_id = b.id
          AND cf.tenant_id = b.tenant_id
          AND cf.type = 'income'
          AND cf.category = 'booking'
      )
      AND NOT EXISTS (SELECT 1 FROM booking_write_offs w WHERE w.booking_id = b.id)
      ${dateFilter}
    ORDER BY b.starts_at ASC, b.id ASC
    ${limitClause}
    FOR UPDATE OF b
  `)) as unknown as Array<{ id: string }>

  const coveredBookingIds = await linkBookingsToSettlement(
    tenantId,
    eligibleRows.map((r) => r.id),
    settlement.id,
    tx,
  )

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'booking_settlement.created',
    resourceType: 'booking_settlement',
    resourceId: settlement.id,
    metadata: {
      abonadoId: abonado.id,
      kind: settlement.kind,
      paymentOrigin: settlement.paymentOrigin,
      amount: settlement.amount,
      creditsTotal: settlement.creditsTotal,
      periodStart,
      periodEnd,
      coveredCount: coveredBookingIds.length,
    },
  })

  return { settlement, coveredBookingIds }
}

/**
 * Marca o cobra en un único acuerdo un grupo de turnos (1 turno marcado "Ya estaba saldado"
 * o múltiples turnos / fechas de un evento o torneo).
 */
export async function settleBookingsBatch(
  tenantId: string,
  staffUserId: string,
  input: SettleBookingsBatchInput,
  tx: DbTx,
): Promise<SettlementOutcome> {
  const uniqueIds = [...new Set(input.bookingIds)].sort()
  if (uniqueIds.length === 0) {
    throw new SettlementValidationError('Elegí al menos un turno.')
  }

  const splitCharges = assertChargesMatchTotal(input.paymentOrigin, input.amount, input.charges)

  if (input.paymentOrigin === 'caja' && input.clientIdempotencyKey) {
    const idempotent = await resolveIdempotentCharges(
      tenantId,
      splitCharges,
      input.clientIdempotencyKey,
      tx,
    )
    if (!idempotent.ok) {
      throw new SettlementConflictError(idempotent.error)
    }
    if (idempotent.newChargingCents === 0) {
      const replay = await findReplayOutcome(tenantId, input.clientIdempotencyKey, tx)
      if (replay) return replay
    }
  }

  const idList = sql.join(
    uniqueIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )

  // Lock en orden fijo `id` para evitar deadlocks en selecciones múltiples.
  const rows = (await tx.execute(sql`
    SELECT b.id, b.court_id, b.abonado_id, b.type, b.status,
           b.price_snapshot, b.deposit_amount, b.deposit_status, b.settlement_id,
           (SELECT w.amount FROM booking_write_offs w WHERE w.booking_id = b.id)::int AS written_off,
           COALESCE(
             (
               SELECT SUM(cf.amount)
               FROM cash_flows cf
               WHERE cf.booking_id = b.id
                 AND cf.tenant_id = b.tenant_id
                 AND cf.type = 'income'
                 AND cf.category = 'booking'
                 AND cf.description <> ('Seña — turno ' || b.id::text)
             ),
             0
           )::int AS charges_total
    FROM bookings b
    WHERE b.tenant_id = ${tenantId}
      AND b.id IN (${idList})
    ORDER BY b.id ASC
    FOR UPDATE OF b
  `)) as unknown as Array<{
    id: string
    court_id: string
    abonado_id: string | null
    type: string
    status: string
    price_snapshot: number
    deposit_amount: number
    deposit_status: string
    settlement_id: string | null
    written_off: number | null
    charges_total: number
  }>

  if (rows.length !== uniqueIds.length) {
    throw new SettlementValidationError('Alguno de los turnos seleccionados no existe.')
  }

  const courtIds = new Set<string>()
  for (const r of rows) {
    if (r.type === 'block') {
      throw new SettlementValidationError('Un bloqueo no se puede marcar como saldado.')
    }
    if (r.status !== 'confirmed' && r.status !== 'completed') {
      throw new SettlementConflictError('Solo se pueden saldar turnos confirmados o jugados.')
    }
    if (r.settlement_id) {
      throw new SettlementConflictError('Alguno de los turnos seleccionados ya estaba saldado.')
    }
    // Un turno dado por perdido no se salda: la plata ya se resignó (booking_write_offs).
    if (r.written_off != null) {
      throw new SettlementConflictError('Alguno de los turnos seleccionados está dado por perdido.')
    }
    const { pending } = summarizeBookingCharges({
      priceSnapshot: r.price_snapshot,
      depositAmount: r.deposit_amount,
      depositStatus: r.deposit_status,
      chargesTotal: r.charges_total,
      writtenOff: 0,
    })
    if (pending <= 0 && r.price_snapshot > 0) {
      throw new SettlementConflictError('Alguno de los turnos seleccionados ya está pago.')
    }
    courtIds.add(r.court_id)
  }

  const singleCourtId = courtIds.size === 1 ? ([...courtIds][0] ?? null) : null
  const ledgerLabel =
    uniqueIds.length === 1 ? 'Turno saldado' : `Saldado conjunto (${uniqueIds.length} turnos)`

  const inserted = await tx
    .insert(bookingSettlements)
    .values({
      tenantId,
      abonadoId: null,
      courtId: singleCourtId,
      kind: 'bookings',
      paymentOrigin: input.paymentOrigin,
      amount: input.amount,
      creditsTotal: null,
      periodStart: null,
      periodEnd: null,
      createdByStaff: staffUserId,
    })
    .returning()

  const settlement = rowToSettlementRow(inserted[0]!)

  if (input.paymentOrigin === 'caja') {
    await chargeSplitPayment(
      tenantId,
      staffUserId,
      splitCharges,
      (_c, i) => ({
        type: 'income',
        category: 'booking',
        description:
          splitCharges.length === 1
            ? ledgerLabel
            : `${ledgerLabel} (${i + 1}/${splitCharges.length})`,
        settlementId: settlement.id,
      }),
      input.clientIdempotencyKey,
      tx,
    )
  }

  const coveredBookingIds = await linkBookingsToSettlement(tenantId, uniqueIds, settlement.id, tx)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'booking_settlement.created',
    resourceType: 'booking_settlement',
    resourceId: settlement.id,
    metadata: {
      kind: 'bookings',
      paymentOrigin: settlement.paymentOrigin,
      amount: settlement.amount,
      courtId: singleCourtId,
      coveredBookingIds,
    },
  })

  return { settlement, coveredBookingIds }
}

/**
 * Deshace un saldado marcado con "Ya estaba saldado" (sin movimiento en Caja).
 * Los cobros reales registrados en Caja no se eliminan desde acá para mantener el arqueo.
 */
export async function voidSettlement(
  tenantId: string,
  settlementId: string,
  staffUserId: string,
  tx: DbTx,
): Promise<void> {
  const rows = (await tx.execute(sql`
    SELECT id, payment_origin, voided_at
    FROM booking_settlements
    WHERE id = ${settlementId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `)) as unknown as Array<{
    id: string
    payment_origin: 'caja' | 'already_settled'
    voided_at: string | null
  }>

  const row = rows[0]
  if (!row) throw new SettlementNotFoundError(settlementId)
  if (row.voided_at) throw new SettlementConflictError('Este saldado ya fue anulado.')
  if (row.payment_origin === 'caja') {
    throw new SettlementValidationError(
      'Este acuerdo tuvo un cobro en Caja y no se deshace desde acá.',
    )
  }

  await enableBookingSettlementUpdate(tx)
  const detached = (await tx.execute(sql`
    UPDATE bookings
    SET settlement_id = NULL
    WHERE tenant_id = ${tenantId}
      AND settlement_id = ${settlementId}
      AND status IN ('confirmed', 'completed')
    RETURNING id
  `)) as unknown as Array<{ id: string }>

  await tx
    .update(bookingSettlements)
    .set({ voidedAt: new Date(), voidedByStaff: staffUserId })
    .where(and(eq(bookingSettlements.id, settlementId), eq(bookingSettlements.tenantId, tenantId)))

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'booking_settlement.voided',
    resourceType: 'booking_settlement',
    resourceId: settlementId,
    metadata: { detachedBookingIds: detached.map((d) => d.id) },
  })
}

/** Resume la cobertura activa (meses saldados y packs con turnos por jugar) de N abonados. */
export async function listAbonadoCoverageByIds(
  tenantId: string,
  abonadoIds: readonly string[],
  tx: DbTx,
): Promise<Map<string, AbonadoCoverageSummary>> {
  const result = new Map<string, AbonadoCoverageSummary>()
  if (abonadoIds.length === 0) return result

  const idList = sql.join(
    abonadoIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )

  const abonadoRows = (await tx.execute(sql`
    SELECT id, billing_mode, agreed_amount
    FROM abonados
    WHERE tenant_id = ${tenantId} AND id IN (${idList})
  `)) as unknown as Array<{
    id: string
    billing_mode: AbonadoBillingMode
    agreed_amount: number
  }>

  for (const a of abonadoRows) {
    result.set(a.id, {
      abonadoId: a.id,
      billingMode: a.billing_mode,
      agreedAmount: a.agreed_amount,
      coveredMonths: [],
      remainingPackSessions: 0,
      activePackTotalCredits: 0,
      coveredUpcomingCount: 0,
    })
  }

  const settlementRows = (await tx.execute(sql`
    SELECT bs.id, bs.abonado_id, bs.kind, bs.credits_total,
           bs.period_start::text AS period_start,
           COUNT(b.id) FILTER (WHERE b.status IN ('completed', 'no_show'))::int AS consumed_played,
           COUNT(b.id) FILTER (WHERE b.status = 'confirmed')::int AS upcoming_covered
    FROM booking_settlements bs
    LEFT JOIN bookings b ON b.settlement_id = bs.id AND b.tenant_id = bs.tenant_id
    WHERE bs.tenant_id = ${tenantId}
      AND bs.abonado_id IN (${idList})
      AND bs.voided_at IS NULL
    GROUP BY bs.id
    ORDER BY bs.created_at ASC
  `)) as unknown as Array<{
    id: string
    abonado_id: string
    kind: 'monthly' | 'pack'
    credits_total: number | null
    period_start: string | null
    consumed_played: number
    upcoming_covered: number
  }>

  for (const s of settlementRows) {
    const summary = result.get(s.abonado_id)
    if (!summary) continue
    summary.coveredUpcomingCount += s.upcoming_covered

    if (s.kind === 'monthly' && s.period_start) {
      const ym = s.period_start.slice(0, 7)
      if (!summary.coveredMonths.includes(ym)) {
        summary.coveredMonths.push(ym)
      }
    } else if (s.kind === 'pack' && s.credits_total != null) {
      const remaining = Math.max(0, s.credits_total - s.consumed_played)
      if (remaining > 0) {
        summary.remainingPackSessions += remaining
        summary.activePackTotalCredits += s.credits_total
      }
    }
  }

  return result
}
