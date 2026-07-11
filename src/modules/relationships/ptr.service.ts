import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { assertDayOpen } from '@/modules/cashflow/cashflow.service'
import type { CashFlowRow, CashPaymentMethod } from '@/modules/cashflow/cashflow.types'
import { NoDebtError, DebtOverpaymentError } from './ptr.errors'

export type PlayerBlockState = {
  /** Saldo deudor en centavos de ARS. > 0 = el jugador debe plata al complejo. */
  balance: number
  /** Estado de la relación: 'active' | 'blocked' (bloqueo explícito del complejo). */
  status: string
}

/**
 * Lee el estado de bloqueo del jugador en un complejo desde
 * player_tenant_relationships. Devuelve el default no-bloqueante si todavía no
 * existe la relación (primer contacto del jugador con el complejo).
 */
export async function getPlayerBlockState(
  playerId: string,
  tenantId: string,
  tx: DbTx,
): Promise<PlayerBlockState> {
  const rows = (await tx.execute(sql`
    SELECT balance, status
    FROM player_tenant_relationships
    WHERE player_id = ${playerId} AND tenant_id = ${tenantId}
    LIMIT 1
  `)) as unknown as Array<{ balance: number | string; status: string }>
  const row = rows[0]
  if (!row) return { balance: 0, status: 'active' }
  return { balance: Number(row.balance ?? 0), status: row.status }
}

/**
 * Regla de negocio (CLAUDE.md): un jugador con saldo deudor (> 0) o con la
 * relación marcada como 'blocked' no puede reservar online en ese complejo.
 * Función pura para poder testearla sin DB.
 */
export function isBlockedForOnlineBooking(state: PlayerBlockState): boolean {
  return state.balance > 0 || state.status === 'blocked'
}

export async function ensurePTR(
  playerId: string,
  tenantId: string,
  tx: DbTx,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id, bookings_count, last_booking_at)
    VALUES (${tenantId}, ${playerId}, 1, NOW())
    ON CONFLICT (player_id, tenant_id)
    DO UPDATE SET
      bookings_count = player_tenant_relationships.bookings_count + 1,
      last_booking_at = NOW()
  `)
}

/**
 * Tarea #5 — Asienta deuda por no-show en player_tenant_relationships.balance.
 *
 * Incremento atómico vía UPSERT (`balance = balance + amount`): serializa
 * no-shows concurrentes del mismo jugador (la fila se lockea en el DO UPDATE) y
 * crea la relación si la reserva era manual y el jugador todavía no tenía PTR
 * (createManualBooking no llama a ensurePTR). No-op si amount <= 0 (block, o
 * seña capturada ≥ precio). Debe correr dentro del mismo tx que la transición a
 * no_show para que deuda y estado del booking sean atómicos.
 */
export async function addNoShowDebt(
  tenantId: string,
  playerId: string,
  amount: number,
  tx: DbTx,
): Promise<void> {
  if (amount <= 0) return
  await tx.execute(sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id, balance)
    VALUES (${tenantId}, ${playerId}, ${amount})
    ON CONFLICT (player_id, tenant_id)
    DO UPDATE SET balance = player_tenant_relationships.balance + ${amount}
  `)
}

type RawCashFlow = {
  id: string
  tenant_id: string
  type: CashFlowRow['type']
  category: CashFlowRow['category']
  amount: number
  method: CashPaymentMethod
  description: string
  booking_id: string | null
  product_id: string | null
  registered_by: string
  occurred_at: Date
  created_at: Date
}

function rawToCashFlowRow(r: RawCashFlow): CashFlowRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    type: r.type,
    category: r.category,
    amount: Number(r.amount),
    method: r.method,
    description: r.description,
    bookingId: r.booking_id,
    productId: r.product_id,
    registeredBy: r.registered_by,
    occurredAt: new Date(r.occurred_at),
    createdAt: new Date(r.created_at),
  }
}

export type RegisterDebtPaymentInput = {
  playerId: string
  amount: number
  method: CashPaymentMethod
  note?: string
  clientIdempotencyKey?: string
}

/**
 * Tarea #9 — Cobro de deuda del jugador (saldo deudor generado por no-shows
 * previos, cambio #5). Reduce player_tenant_relationships.balance y registra un
 * CashFlow income que entra a la caja del día.
 *
 * Idempotente: el descuento del balance va atado a que el INSERT del CashFlow
 * haya creado fila nueva (ON CONFLICT por idempotency key). Un reintento con la
 * misma clave no vuelve a descontar. La deuda NO es una billetera: se rechaza el
 * pago que supere el saldo deudor.
 */
export async function registerDebtPayment(
  tenantId: string,
  staffUserId: string,
  input: RegisterDebtPaymentInput,
  tx: DbTx,
): Promise<{ newBalance: number; cashFlow: CashFlowRow }> {
  // FOR UPDATE: serializa pagos concurrentes sobre el mismo saldo deudor. Sin el
  // lock, dos pagos simultáneos leen el mismo balance, ambos pasan el chequeo de
  // sobrepago e ingresan plata de más a la caja (over-collection).
  const ptrRows = (await tx.execute(sql`
    SELECT balance FROM player_tenant_relationships
    WHERE player_id = ${input.playerId} AND tenant_id = ${tenantId}
    LIMIT 1
    FOR UPDATE
  `)) as unknown as Array<{ balance: number | string }>
  const ptr = ptrRows[0]
  if (!ptr) throw new NoDebtError()
  const balance = Number(ptr.balance ?? 0)
  if (balance <= 0) throw new NoDebtError()
  if (input.amount > balance) throw new DebtOverpaymentError(balance)

  const occurredAt = new Date()
  await assertDayOpen(tenantId, occurredAt, tx)

  const description = input.note?.trim() ? input.note.trim() : 'Pago de deuda'

  const inserted = (await tx.execute(sql`
    INSERT INTO cash_flows (
      tenant_id, type, category, amount, method, description,
      registered_by, occurred_at, client_idempotency_key
    ) VALUES (
      ${tenantId}, 'income'::cashflow_type, 'other'::cashflow_category,
      ${input.amount}, ${input.method}::payment_method, ${description},
      ${staffUserId}, ${occurredAt.toISOString()}, ${input.clientIdempotencyKey ?? null}
    )
    ON CONFLICT (client_idempotency_key) WHERE client_idempotency_key IS NOT NULL DO NOTHING
    RETURNING *
  `)) as unknown as RawCashFlow[]

  let cashFlow: CashFlowRow
  if (inserted[0]) {
    cashFlow = rawToCashFlowRow(inserted[0])
    await tx.execute(sql`
      UPDATE player_tenant_relationships
      SET balance = GREATEST(0, balance - ${input.amount})
      WHERE player_id = ${input.playerId} AND tenant_id = ${tenantId}
    `)
    await insertAuditLog(tx, {
      tenantId,
      actorId: staffUserId,
      actorType: 'staff',
      action: 'player.debt_payment',
      resourceType: 'player',
      resourceId: input.playerId,
      metadata: { amount: input.amount, method: input.method, cashFlowId: cashFlow.id },
    })
  } else {
    // Reintento con la misma idempotency key: no se descuenta de nuevo.
    const existing = (await tx.execute(sql`
      SELECT * FROM cash_flows WHERE client_idempotency_key = ${input.clientIdempotencyKey} LIMIT 1
    `)) as unknown as RawCashFlow[]
    cashFlow = rawToCashFlowRow(existing[0]!)
  }

  const balRows = (await tx.execute(sql`
    SELECT balance FROM player_tenant_relationships
    WHERE player_id = ${input.playerId} AND tenant_id = ${tenantId}
    LIMIT 1
  `)) as unknown as Array<{ balance: number | string }>

  return { newBalance: Number(balRows[0]?.balance ?? 0), cashFlow }
}
