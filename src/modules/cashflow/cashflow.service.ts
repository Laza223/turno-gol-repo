import { sql } from 'drizzle-orm'
import { cashFlows } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import {
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
  DayAlreadyClosedError,
  AdjustmentRequiredForClosedDayError,
} from './cashflow.errors'
import { nightCutoffMins, operatingDateOf, operatingDayRangeUtc } from '@/shared/time/operating-day'
import { rawRowToDailyCloseRow, type DailyCashCloseRawRow } from './daily-close.service'
import { balanceFrom, collectedFrom } from './totals'
import type {
  CashFlowType,
  CashFlowCategory,
  CashFlowRow,
  DaySummary,
  CreateCashFlowInput,
} from './cashflow.types'

const VALID_COMBOS: Record<CashFlowType, CashFlowCategory[]> = {
  // migr. 066: 'tournament' es un ingreso, y el CHECK de DB lo obliga a venir
  // con tournamentTeamId. La Server Action genérica de Caja NO lo ofrece: el
  // único camino es registerInscriptionPayment.
  income: ['booking', 'product_sale', 'other', 'tournament'],
  adjustment: ['other', 'no_show_correction'],
  // migr. 050: 'operating_expense' queda como legacy válido (el CHECK de DB
  // también lo conserva); la UI nueva solo ofrece las 5 específicas.
  expense: [
    'operating_expense',
    'merchandise',
    'salaries',
    'utilities',
    'maintenance',
    'other_expense',
  ],
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

/** Fila que devuelve el query builder de Drizzle: camelCase, fechas ya parseadas. */
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
    tournamentTeamId: r.tournamentTeamId ?? null,
    registeredBy: r.registeredBy,
    occurredAt: r.occurredAt,
    createdAt: r.createdAt,
  }
}

/**
 * B8 — la MISMA tabla leída con SQL crudo NO devuelve esto. `tx.execute()`
 * entrega las claves tal cual las nombra Postgres (snake_case) y las fechas
 * como string, no como Date. `typeof cashFlows.$inferSelect` describe la salida
 * del query builder y NADA más: usarlo sobre un `SELECT *`/`RETURNING *` crudo
 * hace que `r.tenantId` compile y valga `undefined` en runtime.
 */
type CashFlowRawRow = {
  id: string
  tenant_id: string
  type: CashFlowType
  category: CashFlowCategory
  amount: number
  method: CashFlowRow['method']
  description: string
  booking_id: string | null
  tournament_team_id: string | null
  registered_by: string
  occurred_at: string
  created_at: string
}

function rawRowToCashFlowRow(r: CashFlowRawRow): CashFlowRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    type: r.type,
    category: r.category,
    amount: r.amount,
    method: r.method,
    description: r.description,
    bookingId: r.booking_id,
    tournamentTeamId: r.tournament_team_id,
    registeredBy: r.registered_by,
    occurredAt: new Date(r.occurred_at),
    createdAt: new Date(r.created_at),
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
async function assertDayOpen(
  tenantId: string,
  occurredAt: Date,
  tx: DbTx,
  /** Toma el lock igual, pero no rechaza si el día ya cerró (ver `allowClosedDay`). */
  allowClosed = false,
): Promise<void> {
  const lockKey = `daily_close:${tenantId}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)
  if (allowClosed) return

  // cutoffMins se resuelve ACÁ, no como parámetro: createCashFlow (y por lo
  // tanto assertDayOpen) no cambia su firma pública en este esfuerzo — tiene
  // 7+ callers fuera de alcance. El SELECT es liviano (tenants es global, sin
  // RLS, PK lookup) y deja el guard de escritura con el MISMO criterio de día
  // operativo que las lecturas migradas (getCashFlows/getDaySummary).
  const tenantRows = await tx.execute(
    sql`SELECT opening_hours AS "openingHours", closes_next_day AS "closesNextDay"
        FROM tenants WHERE id = ${tenantId} LIMIT 1`,
  )
  const tenantRow = (
    tenantRows as unknown as Array<{
      openingHours: Record<string, { open: string; close: string; closed?: boolean }>
      closesNextDay: boolean
    }>
  )[0]
  const cutoffMins = tenantRow
    ? nightCutoffMins(tenantRow.openingHours, tenantRow.closesNextDay)
    : 0
  const operatingDate = operatingDateOf(occurredAt, cutoffMins)

  const closeCheck = await tx.execute(
    sql`SELECT id FROM daily_cash_closes WHERE tenant_id = ${tenantId} AND date = ${operatingDate}::date LIMIT 1`,
  )
  if ((closeCheck as unknown[]).length > 0) {
    throw new DayAlreadyClosedError(operatingDate)
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

  if (input.allowClosedDay && input.type !== 'adjustment') {
    throw new AdjustmentRequiredForClosedDayError(input.type)
  }
  // Aun salteando el chequeo de cierre hay que ENTRAR igual: assertDayOpen toma
  // el advisory lock que serializa contra un cierre concurrente. Saltear la
  // llamada entera dejaría el ajuste corriendo en paralelo a closeDailyRegister.
  await assertDayOpen(tenantId, occurredAt, tx, input.allowClosedDay ?? false)

  // Fix #55: si el cliente envía una idempotency key, usar ON CONFLICT DO NOTHING
  // para ignorar el segundo insert en caso de doble-submit o reintento de red.
  if (input.clientIdempotencyKey) {
    const result = await tx.execute<CashFlowRawRow>(sql`
      INSERT INTO cash_flows (
        tenant_id, type, category, amount, method, description,
        booking_id, tournament_team_id, registered_by, occurred_at, client_idempotency_key
      ) VALUES (
        ${tenantId}, ${input.type}::cashflow_type, ${input.category}::cashflow_category,
        ${input.amount}, ${input.method}::payment_method, ${input.description},
        ${input.bookingId ?? null}, ${input.tournamentTeamId ?? null},
        ${staffUserId}, ${occurredAt.toISOString()},
        ${input.clientIdempotencyKey}
      )
      ON CONFLICT (client_idempotency_key) WHERE client_idempotency_key IS NOT NULL DO NOTHING
      RETURNING *
    `)
    const inserted = [...result][0]
    if (inserted) return rawRowToCashFlowRow(inserted)

    // Row already existed — fetch it to return a consistent result.
    const existing = await tx.execute<CashFlowRawRow>(sql`
      SELECT * FROM cash_flows
      WHERE client_idempotency_key = ${input.clientIdempotencyKey}
      LIMIT 1
    `)
    return rawRowToCashFlowRow([...existing][0]!)
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
      tournamentTeamId: input.tournamentTeamId ?? null,
      registeredBy: staffUserId,
      occurredAt,
    })
    .returning()

  return rowToCashFlowRow(rows[0]!)
}

export type SplitCharge = { amount: number; method: CreateCashFlowInput['method'] }

/**
 * Inserta N `cash_flows`, uno por línea de `charges` — el patrón de "cobro
 * con método mixto" (D2, criterio de salida #3 de Fase 1: docs/planning/
 * 2026-08-01-decisiones-de-fase-v2.md §3). Cada línea es idempotente por
 * separado (`${clientIdempotencyKey}-${i}`), mismo criterio que ya usaba
 * chargeDebtAction (caja/deudas/actions.ts) a mano antes de esta extracción.
 *
 * A propósito NO valida el total contra "lo pendiente": esa regla difiere
 * por entidad (un booking admite pago parcial, un fiado de cantina exige el
 * monto exacto del ticket) y depende del lock que cada caller ya tomó sobre
 * su propia fila ANTES de invocar esto — validarlo acá sería una fuente de
 * verdad paralela a la del caller, que es quien determina qué "correcto"
 * significa para su tabla. Ver la guardia en el caller (ej. settleTab,
 * registerInscriptionPayment).
 */
export async function chargeSplitPayment(
  tenantId: string,
  staffUserId: string,
  charges: SplitCharge[],
  build: (
    charge: SplitCharge,
    index: number,
  ) => Omit<CreateCashFlowInput, 'amount' | 'method' | 'clientIdempotencyKey'>,
  clientIdempotencyKey: string | undefined,
  tx: DbTx,
): Promise<CashFlowRow[]> {
  const rows: CashFlowRow[] = []
  for (let i = 0; i < charges.length; i++) {
    const charge = charges[i]!
    const lineKey = clientIdempotencyKey ? `${clientIdempotencyKey}-${i}` : undefined
    rows.push(
      await createCashFlow(
        tenantId,
        staffUserId,
        {
          ...build(charge, i),
          amount: charge.amount,
          method: charge.method,
          clientIdempotencyKey: lineKey,
        },
        tx,
      ),
    )
  }
  return rows
}

export async function getCashFlows(
  tenantId: string,
  date: string,
  cutoffMins: number,
  tx: DbTx,
): Promise<CashFlowRow[]> {
  // Rango UTC sargable en vez de expresión AT TIME ZONE: ver operatingDayRangeUtc
  // (bajo RLS la expresión no entra al índice — hallazgo D3).
  const day = operatingDayRangeUtc(date, cutoffMins)
  const rows = await tx.execute<CashFlowRawRow>(
    sql`SELECT * FROM cash_flows
        WHERE tenant_id = ${tenantId}
          AND occurred_at >= ${day.fromUtc.toISOString()}
          AND occurred_at < ${day.toUtc.toISOString()}
        ORDER BY occurred_at DESC`,
  )
  return [...rows].map(rawRowToCashFlowRow)
}

export async function getDaySummary(
  tenantId: string,
  date: string,
  cutoffMins: number,
  tx: DbTx,
): Promise<DaySummary> {
  // Rango UTC sargable (ver operatingDayRangeUtc / hallazgo D3).
  const day = operatingDayRangeUtc(date, cutoffMins)
  const aggRows = await tx.execute(
    sql`SELECT type, category, method, SUM(amount)::int AS total
        FROM cash_flows
        WHERE tenant_id = ${tenantId}
          AND occurred_at >= ${day.fromUtc.toISOString()}
          AND occurred_at < ${day.toUtc.toISOString()}
        GROUP BY type, category, method`,
  )

  let totalIncome = 0
  let totalAdjustments = 0
  let totalExpense = 0
  const byCategory: Partial<Record<CashFlowCategory, number>> = {}
  const byMethod: Partial<Record<'cash' | 'transfer' | 'mercadopago' | 'other', number>> = {}

  for (const row of aggRows as unknown as Array<{
    type: string
    category: string
    method: string
    total: number
  }>) {
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

  const closeRows = await tx.execute<DailyCashCloseRawRow>(
    sql`SELECT * FROM daily_cash_closes WHERE tenant_id = ${tenantId} AND date = ${date}::date LIMIT 1`,
  )

  const closeRaw = [...closeRows][0] ?? null
  const close = closeRaw ? rawRowToDailyCloseRow(closeRaw) : null

  return {
    date,
    totalIncome,
    totalAdjustments,
    totalExpense,
    // B14: las dos cuentas salen de `totals.ts`, no se escriben acá. Ver el
    // comentario del campo `collected` en cashflow.types.ts.
    collected: collectedFrom({ totalIncome, totalAdjustments }),
    balance: balanceFrom({ totalIncome, totalAdjustments, totalExpense }),
    byCategory,
    byMethod,
    isClosed: close !== null,
    close,
  }
}
