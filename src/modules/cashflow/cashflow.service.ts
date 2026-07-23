import { sql } from 'drizzle-orm'
import { cashFlows } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import {
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
  DayAlreadyClosedError,
} from './cashflow.errors'
import { artDateOf } from '@/shared/time/art-date'
import type {
  CashFlowType,
  CashFlowCategory,
  CashFlowRow,
  DaySummary,
  DayComparisons,
  DayTotals,
  CreateCashFlowInput,
} from './cashflow.types'

const VALID_COMBOS: Record<CashFlowType, CashFlowCategory[]> = {
  income: ['booking', 'product_sale', 'other'],
  adjustment: ['other', 'no_show_correction'],
  expense: ['operating_expense'],
}

export function validateCashFlowCombo(type: string, category: string): void {
  if (type !== 'income' && type !== 'adjustment' && type !== 'expense') {
    throw new InvalidCashFlowTypeError()
  }
  const allowed = VALID_COMBOS[type as CashFlowType]
  if (!allowed.includes(category as CashFlowCategory)) {
    throw new InvalidCashFlowCategoryError(type, category)
  }
}

function rowToCashFlowRow(r: typeof cashFlows.$inferSelect): CashFlowRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    type: r.type,
    category: r.category,
    amount: r.amount,
    method: r.method,
    description: r.description,
    bookingId: r.bookingId ?? null,
    registeredBy: r.registeredBy,
    occurredAt: r.occurredAt,
    createdAt: r.createdAt,
  }
}

/**
 * Guard de caja cerrada: no se pueden registrar movimientos en un día ya
 * cerrado (DailyCashClose existe). Extraído para reutilizarlo desde flujos que
 * insertan cash_flows fuera de createCashFlow.
 *
 * caza-bugs #14: toma el MISMO advisory lock que closeDailyRegister (keyed por
 * tenant) antes de chequear — si un cierre está corriendo en simultáneo sobre
 * este tenant, este INSERT espera a que termine (commit/rollback) en vez de
 * colarse entre el aggregate y el INSERT del cierre. Sin esto, un movimiento
 * podía insertarse después de que closeDailyRegister ya leyó los totales pero
 * antes de que commiteara, quedando fuera del cierre y aterrizando en un día
 * ya cerrado.
 */
export async function assertDayOpen(
  tenantId: string,
  occurredAt: Date,
  tx: DbTx,
): Promise<void> {
  const lockKey = `daily_close:${tenantId}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)

  const artDate = artDateOf(occurredAt)
  const closeCheck = await tx.execute(
    sql`SELECT id FROM daily_cash_closes WHERE tenant_id = ${tenantId} AND date = ${artDate}::date LIMIT 1`,
  )
  if ((closeCheck as unknown[]).length > 0) {
    throw new DayAlreadyClosedError(artDate)
  }
}

export async function createCashFlow(
  tenantId: string,
  staffUserId: string,
  input: CreateCashFlowInput,
  tx: DbTx,
): Promise<CashFlowRow> {
  validateCashFlowCombo(input.type, input.category)

  const occurredAt = input.occurredAt ?? new Date()

  await assertDayOpen(tenantId, occurredAt, tx)

  // Fix #55: si el cliente envía una idempotency key, usar ON CONFLICT DO NOTHING
  // para ignorar el segundo insert en caso de doble-submit o reintento de red.
  if (input.clientIdempotencyKey) {
    const result = await tx.execute(sql`
      INSERT INTO cash_flows (
        tenant_id, type, category, amount, method, description,
        booking_id, registered_by, occurred_at, client_idempotency_key
      ) VALUES (
        ${tenantId}, ${input.type}::cashflow_type, ${input.category}::cashflow_category,
        ${input.amount}, ${input.method}::payment_method, ${input.description},
        ${input.bookingId ?? null},
        ${staffUserId}, ${occurredAt.toISOString()},
        ${input.clientIdempotencyKey}
      )
      ON CONFLICT (client_idempotency_key) WHERE client_idempotency_key IS NOT NULL DO NOTHING
      RETURNING *
    `)
    const inserted = (result as unknown as Array<typeof cashFlows.$inferSelect>)[0]
    if (inserted) return rowToCashFlowRow(inserted)

    // Row already existed — fetch it to return a consistent result.
    const existing = await tx.execute(sql`
      SELECT * FROM cash_flows
      WHERE client_idempotency_key = ${input.clientIdempotencyKey}
      LIMIT 1
    `)
    return rowToCashFlowRow((existing as unknown as Array<typeof cashFlows.$inferSelect>)[0]!)
  }

  const rows = await tx
    .insert(cashFlows)
    .values({
      tenantId,
      type: input.type,
      category: input.category,
      amount: input.amount,
      method: input.method,
      description: input.description,
      bookingId: input.bookingId ?? null,
      registeredBy: staffUserId,
      occurredAt,
    })
    .returning()

  return rowToCashFlowRow(rows[0]!)
}

export async function getCashFlows(
  tenantId: string,
  date: string,
  tx: DbTx,
): Promise<CashFlowRow[]> {
  const rows = await tx.execute(
    sql`SELECT * FROM cash_flows
        WHERE tenant_id = ${tenantId}
          AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = ${date}::date
        ORDER BY occurred_at DESC`,
  )
  return (rows as unknown as Array<{
    id: string
    tenant_id: string
    type: CashFlowType
    category: CashFlowCategory
    amount: number
    method: 'cash' | 'transfer' | 'mercadopago' | 'other'
    description: string
    booking_id: string | null
    registered_by: string
    occurred_at: Date
    created_at: Date
  }>).map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    type: r.type,
    category: r.category,
    amount: r.amount,
    method: r.method,
    description: r.description,
    bookingId: r.booking_id,
    registeredBy: r.registered_by,
    occurredAt: new Date(r.occurred_at),
    createdAt: new Date(r.created_at),
  }))
}

/**
 * Comparativas para el resumen de caja: totales de ayer y promedio diario de
 * los 7 días anteriores a `date`. Una sola query agregada por día y tipo;
 * los ajustes suman dentro de totalIncome (mismo criterio que el saldo).
 */
export async function getDayComparisons(
  tenantId: string,
  date: string,
  tx: DbTx,
): Promise<DayComparisons> {
  const rows = await tx.execute(
    sql`SELECT (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day,
               type, SUM(amount)::int AS total
        FROM cash_flows
        WHERE tenant_id = ${tenantId}
          AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
              BETWEEN (${date}::date - 7) AND (${date}::date - 1)
        GROUP BY 1, 2`,
  )

  const yesterdayStr = (() => {
    const d = new Date(date + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const yesterday: DayTotals = { totalIncome: 0, totalExpense: 0, balance: 0 }
  let weekIncome = 0
  let weekExpense = 0

  for (const row of (rows as unknown as Array<{ day: string; type: string; total: number }>)) {
    const total = row.total ?? 0
    const income = row.type === 'expense' ? 0 : total
    const expense = row.type === 'expense' ? total : 0
    weekIncome += income
    weekExpense += expense
    if (row.day === yesterdayStr) {
      yesterday.totalIncome += income
      yesterday.totalExpense += expense
    }
  }
  yesterday.balance = yesterday.totalIncome - yesterday.totalExpense

  const weekAvg: DayTotals = {
    totalIncome: Math.round(weekIncome / 7),
    totalExpense: Math.round(weekExpense / 7),
    balance: Math.round((weekIncome - weekExpense) / 7),
  }

  return { yesterday, weekAvg }
}

export async function getDaySummary(
  tenantId: string,
  date: string,
  tx: DbTx,
): Promise<DaySummary> {
  const aggRows = await tx.execute(
    sql`SELECT type, category, method, SUM(amount)::int AS total
        FROM cash_flows
        WHERE tenant_id = ${tenantId}
          AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = ${date}::date
        GROUP BY type, category, method`,
  )

  let totalIncome = 0
  let totalAdjustments = 0
  let totalExpense = 0
  const byCategory: Partial<Record<CashFlowCategory, number>> = {}
  const byMethod: Partial<Record<'cash' | 'transfer' | 'mercadopago' | 'other', number>> = {}

  for (const row of (aggRows as unknown as Array<{ type: string; category: string; method: string; total: number }>)) {
    const total = row.total ?? 0
    if (row.type === 'income') totalIncome += total
    else if (row.type === 'adjustment') totalAdjustments += total
    else if (row.type === 'expense') totalExpense += total

    const cat = row.category as CashFlowCategory
    byCategory[cat] = (byCategory[cat] ?? 0) + total

    // byMethod es neto: el admin lo usa para arqueo (cuánto quedó en efectivo /
    // MP / transferencia), así que un gasto resta de su método.
    const signed = row.type === 'expense' ? -total : total
    const meth = row.method as 'cash' | 'transfer' | 'mercadopago' | 'other'
    byMethod[meth] = (byMethod[meth] ?? 0) + signed
  }

  const closeRows = await tx.execute(
    sql`SELECT * FROM daily_cash_closes WHERE tenant_id = ${tenantId} AND date = ${date}::date LIMIT 1`,
  )

  const closeRaw = (closeRows as unknown as Array<{
    id: string
    tenant_id: string
    date: Date
    total_income: number
    total_adjustments: number
    total_expense: number
    balance: number
    declared_cash: number
    diff_amount: number
    opening_cash: number | null
    expected_cash: number | null
    note: string | null
    closed_by: string
    closed_at: Date
  }>)[0] ?? null

  const close = closeRaw
    ? {
        id: closeRaw.id,
        tenantId: closeRaw.tenant_id,
        date: new Date(closeRaw.date),
        totalIncome: closeRaw.total_income,
        totalAdjustments: closeRaw.total_adjustments,
        totalExpense: closeRaw.total_expense,
        balance: closeRaw.balance,
        declaredCash: closeRaw.declared_cash,
        diffAmount: closeRaw.diff_amount,
        openingCash: closeRaw.opening_cash,
        expectedCash: closeRaw.expected_cash,
        note: closeRaw.note,
        closedBy: closeRaw.closed_by,
        closedAt: new Date(closeRaw.closed_at),
      }
    : null

  return {
    date,
    totalIncome,
    totalAdjustments,
    totalExpense,
    balance: totalIncome + totalAdjustments - totalExpense,
    byCategory,
    byMethod,
    isClosed: close !== null,
    close,
  }
}
