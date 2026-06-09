import { sql } from 'drizzle-orm'
import { dailyCashCloses } from '@/shared/db/schema'
import { insertAuditLog } from '@/shared/db/audit'
import type { DbTx } from '@/shared/db/client'
import { DayAlreadyCloseExistsError } from './cashflow.errors'
import type { DailyCashCloseRow, CashFlowType } from './cashflow.types'

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  )
}

async function aggregateTotals(
  tenantId: string,
  date: string,
  tx: DbTx,
): Promise<{ totalIncome: number; totalAdjustments: number }> {
  const rows = await tx.execute(
    sql`SELECT type, SUM(amount)::int AS total
        FROM cash_flows
        WHERE tenant_id = ${tenantId}
          AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = ${date}::date
        GROUP BY type`,
  )

  let totalIncome = 0
  let totalAdjustments = 0
  for (const row of (rows as unknown as Array<{ type: string; total: number }>)) {
    if (row.type === ('income' as CashFlowType)) totalIncome = row.total ?? 0
    if (row.type === ('adjustment' as CashFlowType)) totalAdjustments = row.total ?? 0
  }
  return { totalIncome, totalAdjustments }
}

export async function closeDailyRegister(
  tenantId: string,
  date: string,
  staffUserId: string,
  opts: { declaredCash?: number; note?: string },
  tx: DbTx,
): Promise<DailyCashCloseRow> {
  const existing = await tx.execute(
    sql`SELECT id FROM daily_cash_closes WHERE tenant_id = ${tenantId} AND date = ${date}::date LIMIT 1`,
  )
  if ((existing as unknown[]).length > 0) {
    throw new DayAlreadyCloseExistsError(date)
  }

  const { totalIncome, totalAdjustments } = await aggregateTotals(tenantId, date, tx)
  const balance = totalIncome + totalAdjustments
  const declaredCash = opts.declaredCash ?? 0
  const diffAmount = balance - declaredCash

  let closeRow: typeof dailyCashCloses.$inferSelect
  try {
    const rows = await tx
      .insert(dailyCashCloses)
      .values({
        tenantId,
        date: new Date(date),
        totalIncome,
        totalAdjustments,
        balance,
        declaredCash,
        diffAmount,
        note: opts.note ?? null,
        closedBy: staffUserId,
      })
      .returning()
    closeRow = rows[0]!
  } catch (err) {
    if (isUniqueViolation(err)) throw new DayAlreadyCloseExistsError(date)
    throw err
  }

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'cashflow.daily_close',
    resourceType: 'daily_cash_close',
    resourceId: closeRow.id,
    metadata: { date, balance, declaredCash, diffAmount },
  })

  return {
    id: closeRow.id,
    tenantId: closeRow.tenantId,
    date: closeRow.date,
    totalIncome: closeRow.totalIncome,
    totalAdjustments: closeRow.totalAdjustments,
    balance: closeRow.balance,
    declaredCash: closeRow.declaredCash,
    diffAmount: closeRow.diffAmount,
    note: closeRow.note ?? null,
    closedBy: closeRow.closedBy,
    closedAt: closeRow.closedAt,
  }
}

export async function getDailyClose(
  tenantId: string,
  date: string,
  tx: DbTx,
): Promise<DailyCashCloseRow | null> {
  const rows = await tx.execute(
    sql`SELECT * FROM daily_cash_closes WHERE tenant_id = ${tenantId} AND date = ${date}::date LIMIT 1`,
  )
  const r = (rows as unknown as Array<{
    id: string
    tenant_id: string
    date: Date
    total_income: number
    total_adjustments: number
    balance: number
    declared_cash: number
    diff_amount: number
    note: string | null
    closed_by: string
    closed_at: Date
  }>)[0]
  if (!r) return null
  return {
    id: r.id,
    tenantId: r.tenant_id,
    date: new Date(r.date),
    totalIncome: r.total_income,
    totalAdjustments: r.total_adjustments,
    balance: r.balance,
    declaredCash: r.declared_cash,
    diffAmount: r.diff_amount,
    note: r.note,
    closedBy: r.closed_by,
    closedAt: new Date(r.closed_at),
  }
}
