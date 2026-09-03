import { sql } from 'drizzle-orm'
import { dailyCashCloses } from '@/shared/db/schema'
import { insertAuditLog } from '@/shared/db/audit'
import type { DbTx } from '@/shared/db/client'
import { isUniqueViolation } from '@/shared/db/pg-errors'
import { operatingDateOf, operatingDayRangeUtc } from '@/shared/time/operating-day'
import { CloseDateInFutureError, DayAlreadyCloseExistsError } from './cashflow.errors'
import type { DailyCashCloseRow, CashFlowType } from './cashflow.types'
import { balanceFrom } from './totals'

const UQ_DAILY_CLOSE_PER_TENANT = 'uq_daily_close_per_tenant'

async function aggregateTotals(
  tenantId: string,
  date: string,
  cutoffMins: number,
  tx: DbTx,
): Promise<{
  totalIncome: number
  totalAdjustments: number
  totalExpense: number
  cashNet: number
}> {
  // GROUP BY type, method: los totales por tipo salen sumando métodos, y
  // cashNet (ingresos+ajustes cash − gastos cash) alimenta el efectivo
  // esperado del arqueo (migr. 049). Mismo criterio con signo que el
  // byMethod de getDaySummary.
  // Rango UTC sargable (ver operatingDayRangeUtc / hallazgo D3).
  const day = operatingDayRangeUtc(date, cutoffMins)
  const rows = await tx.execute(
    sql`SELECT type, method, SUM(amount)::int AS total
        FROM cash_flows
        WHERE tenant_id = ${tenantId}
          AND occurred_at >= ${day.fromUtc.toISOString()}
          AND occurred_at < ${day.toUtc.toISOString()}
        GROUP BY type, method`,
  )

  let totalIncome = 0
  let totalAdjustments = 0
  let totalExpense = 0
  let cashNet = 0
  for (const row of rows as unknown as Array<{ type: string; method: string; total: number }>) {
    const total = row.total ?? 0
    if (row.type === ('income' as CashFlowType)) totalIncome += total
    if (row.type === ('adjustment' as CashFlowType)) totalAdjustments += total
    if (row.type === ('expense' as CashFlowType)) totalExpense += total
    if (row.method === 'cash') cashNet += row.type === 'expense' ? -total : total
  }
  return { totalIncome, totalAdjustments, totalExpense, cashNet }
}

export async function closeDailyRegister(
  tenantId: string,
  date: string,
  staffUserId: string,
  opts: { declaredCash?: number; note?: string },
  cutoffMins: number,
  tx: DbTx,
): Promise<DailyCashCloseRow> {
  if (date > operatingDateOf(new Date(), cutoffMins)) {
    throw new CloseDateInFutureError(date)
  }

  // caza-bugs #14: mismo advisory lock que assertDayOpen (keyed por tenant) —
  // serializa el cierre contra altas de cash_flows concurrentes. Sin esto, un
  // alta podía commitear entre el aggregate de totales y el INSERT del cierre
  // (o viceversa), dejando un movimiento fuera del cierre pero aterrizando en
  // un día ya cerrado.
  const lockKey = `daily_close:${tenantId}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)

  const existing = await tx.execute(
    sql`SELECT id FROM daily_cash_closes WHERE tenant_id = ${tenantId} AND date = ${date}::date LIMIT 1`,
  )
  if ((existing as unknown[]).length > 0) {
    throw new DayAlreadyCloseExistsError(date)
  }

  const { totalIncome, totalAdjustments, totalExpense, cashNet } = await aggregateTotals(
    tenantId,
    date,
    cutoffMins,
    tx,
  )
  const balance = balanceFrom({ totalIncome, totalAdjustments, totalExpense })

  // Apertura de caja (migr. 049): snapshot del fondo inicial al cerrar, así
  // el recibo queda autocontenido e inmutable. Sin apertura, fondo 0.
  const openRows = await tx.execute(
    sql`SELECT opening_cash FROM daily_cash_opens WHERE tenant_id = ${tenantId} AND date = ${date}::date LIMIT 1`,
  )
  const openingCash = (openRows as unknown as Array<{ opening_cash: number }>)[0]?.opening_cash ?? 0

  const expectedCash = openingCash + cashNet
  const declaredCash = opts.declaredCash ?? 0
  // Semántica NUEVA (solo cierres con expected_cash NOT NULL): lo contado
  // menos lo esperado. Positivo = sobra plata; negativo = falta. Los cierres
  // legacy (expected_cash NULL) guardaron balance − declared — la UI branchea.
  const diffAmount = declaredCash - expectedCash

  let closeRow: typeof dailyCashCloses.$inferSelect
  try {
    const rows = await tx
      .insert(dailyCashCloses)
      .values({
        tenantId,
        date: new Date(date),
        totalIncome,
        totalAdjustments,
        totalExpense,
        balance,
        declaredCash,
        diffAmount,
        openingCash,
        expectedCash,
        note: opts.note ?? null,
        closedBy: staffUserId,
      })
      .returning()
    closeRow = rows[0]!
  } catch (err) {
    if (isUniqueViolation(err, UQ_DAILY_CLOSE_PER_TENANT))
      throw new DayAlreadyCloseExistsError(date)
    throw err
  }

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'cashflow.daily_close',
    resourceType: 'daily_cash_close',
    resourceId: closeRow.id,
    metadata: { date, balance, declaredCash, diffAmount, openingCash, expectedCash },
  })

  return {
    id: closeRow.id,
    tenantId: closeRow.tenantId,
    date: closeRow.date,
    totalIncome: closeRow.totalIncome,
    totalAdjustments: closeRow.totalAdjustments,
    totalExpense: closeRow.totalExpense,
    balance: closeRow.balance,
    declaredCash: closeRow.declaredCash,
    diffAmount: closeRow.diffAmount,
    openingCash: closeRow.openingCash ?? null,
    expectedCash: closeRow.expectedCash ?? null,
    note: closeRow.note ?? null,
    closedBy: closeRow.closedBy,
    closedAt: closeRow.closedAt,
  }
}

/**
 * B8 — la fila cruda de `daily_cash_closes` tal cual la entrega `tx.execute()`:
 * claves snake_case y fechas como STRING (`date` es 'YYYY-MM-DD', `closed_at`
 * es un timestamptz sin parsear). Declararlas `Date` acá compilaba y dejaba a
 * `r.closed_at.getTime()` explotando en runtime. Vive exportado porque la MISMA
 * query se repite en `getDaySummary` — dos copias del tipo eran dos lugares
 * donde equivocarse.
 */
export type DailyCashCloseRawRow = {
  id: string
  tenant_id: string
  date: string
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
  closed_at: string
}

export function rawRowToDailyCloseRow(r: DailyCashCloseRawRow): DailyCashCloseRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    date: new Date(r.date),
    totalIncome: r.total_income,
    totalAdjustments: r.total_adjustments,
    totalExpense: r.total_expense,
    balance: r.balance,
    declaredCash: r.declared_cash,
    diffAmount: r.diff_amount,
    openingCash: r.opening_cash,
    expectedCash: r.expected_cash,
    note: r.note,
    closedBy: r.closed_by,
    closedAt: new Date(r.closed_at),
  }
}

export async function getDailyClose(
  tenantId: string,
  date: string,
  tx: DbTx,
): Promise<DailyCashCloseRow | null> {
  const rows = await tx.execute<DailyCashCloseRawRow>(
    sql`SELECT * FROM daily_cash_closes WHERE tenant_id = ${tenantId} AND date = ${date}::date LIMIT 1`,
  )
  const r = [...rows][0]
  return r ? rawRowToDailyCloseRow(r) : null
}
