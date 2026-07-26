/**
 * Cobro de la inscripción (fase 4, migr. 066).
 *
 * No hay tabla de pagos: un pago de inscripción ES una fila de `cash_flows`
 * (income / 'tournament') apuntando al equipo. Por eso entra a Caja, al cierre
 * diario y a los totales del día sin ningún cableado extra, y por eso "cuánto
 * pagó este equipo" es un SUM y no un contador que se pueda desincronizar.
 *
 * Consecuencia aceptada: un pago registrado NO se puede deshacer. Caja no
 * borra movimientos — es plata que entró.
 */
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import type { CashPaymentMethod } from '@/modules/cashflow/cashflow.types'
import { getTeam } from './tournament-team.service'
import {
  InscriptionOverpaidError,
  TeamHasNoFeeError,
  TeamHasPaymentsError,
} from './tournament.errors'
import type {
  InscriptionPaymentRow,
  RegisterInscriptionPaymentInput,
  TeamInscriptionStatus,
} from './tournament.types'

/** Lo que le falta pagar a un equipo. Nunca negativo. */
export function pendingFor(fee: number, paid: number): number {
  return Math.max(0, fee - paid)
}

/**
 * Estado de cobro de todos los equipos del torneo, en una sola query.
 *
 * El LEFT JOIN no filtra por categoría: `chk_cashflow_tournament_team` hace
 * que tener `tournament_team_id` y ser categoría 'tournament' sean la misma
 * cosa, así que el filtro sería redundante y le sacaría el índice parcial.
 */
export async function listInscriptionStatus(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<TeamInscriptionStatus[]> {
  const rows = (await tx.execute(sql`
    SELECT t.id                             AS "teamId",
           t.name                           AS "teamName",
           t.status                         AS "teamStatus",
           t.inscription_fee                AS fee,
           COALESCE(SUM(cf.amount), 0)::int AS paid,
           count(cf.id)::int                AS payments,
           max(cf.occurred_at)              AS "lastPaidAt"
    FROM tournament_teams t
    LEFT JOIN cash_flows cf
      ON cf.tournament_team_id = t.id
     AND cf.tenant_id = t.tenant_id
    WHERE t.tenant_id = ${tenantId} AND t.tournament_id = ${tournamentId}
    GROUP BY t.id, t.name, t.status, t.inscription_fee
    ORDER BY t.name
  `)) as unknown as Array<{
    teamId: string
    teamName: string
    teamStatus: TeamInscriptionStatus['teamStatus']
    fee: number
    paid: number
    payments: number
    lastPaidAt: string | null
  }>

  return rows.map((r) => ({
    teamId: r.teamId,
    teamName: r.teamName,
    teamStatus: r.teamStatus,
    fee: r.fee,
    paid: r.paid,
    pending: pendingFor(r.fee, r.paid),
    payments: r.payments,
    lastPaidAt: r.lastPaidAt ? new Date(r.lastPaidAt) : null,
  }))
}

/** Los movimientos de un equipo, del más nuevo al más viejo. */
export async function listTeamPayments(
  tenantId: string,
  teamId: string,
  tx: DbTx,
): Promise<InscriptionPaymentRow[]> {
  const rows = (await tx.execute(sql`
    SELECT id, amount, method, description, occurred_at AS "occurredAt"
    FROM cash_flows
    WHERE tenant_id = ${tenantId} AND tournament_team_id = ${teamId}
    ORDER BY occurred_at DESC, id
  `)) as unknown as Array<{
    id: string
    amount: number
    method: CashPaymentMethod
    description: string
    occurredAt: string
  }>

  return rows.map((r) => ({
    id: r.id,
    teamId,
    amount: r.amount,
    method: r.method,
    description: r.description,
    occurredAt: new Date(r.occurredAt),
  }))
}

/** Cuántos pagos tiene un equipo. Lo usa el guard de borrado. */
export async function countTeamPayments(
  tenantId: string,
  teamId: string,
  tx: DbTx,
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT count(*)::int AS "count" FROM cash_flows
    WHERE tenant_id = ${tenantId} AND tournament_team_id = ${teamId}
  `)) as unknown as Array<{ count: number }>
  return rows[0]?.count ?? 0
}

/**
 * Registra un cobro de inscripción.
 *
 * Réplica exacta del camino de `addBookingChargeAction` (reservas/actions.ts),
 * que es donde este repo ya pagó el precio de aprender:
 *
 *   1. `FOR UPDATE` sobre la fila del EQUIPO antes de leer lo pagado. Sin el
 *      lock, dos cobros concurrentes leen el mismo pendiente y los dos pasan
 *      la validación (ENS-3: un turno de $10.000 aceptó 2×$8.000).
 *   2. Orden de locks: fila del equipo SIEMPRE antes del advisory lock diario
 *      que toma `createCashFlow` → `assertDayOpen`. Ningún caller invierte ese
 *      orden; invertirlo acá sería un deadlock.
 *   3. Un reintento con la MISMA `clientIdempotencyKey` ya insertada no
 *      re-valida el pendiente: ese cobro ya se aceptó, y volver a compararlo
 *      contra un pendiente que él mismo bajó lo rechazaría por error.
 */
export async function registerInscriptionPayment(
  tenantId: string,
  staffUserId: string,
  input: RegisterInscriptionPaymentInput,
  tx: DbTx,
): Promise<InscriptionPaymentRow> {
  const team = await getTeam(tenantId, input.teamId, tx)

  let alreadyRegistered = false
  if (input.clientIdempotencyKey) {
    const dup = await tx.execute(sql`
      SELECT 1 FROM cash_flows WHERE client_idempotency_key = ${input.clientIdempotencyKey} LIMIT 1
    `)
    alreadyRegistered = (dup as unknown[]).length > 0
  }

  if (!alreadyRegistered) {
    // Arancel en cero = torneo gratis (o equipo con beca): no hay nada que
    // cobrar. Sin esto, CUALQUIER monto sería un sobrepago y el error diría
    // algo incomprensible ("supera lo pendiente de $0").
    if (team.inscriptionFee <= 0) throw new TeamHasNoFeeError(team.name)

    await tx.execute(
      sql`SELECT id FROM tournament_teams WHERE id = ${input.teamId} FOR UPDATE`,
    )

    const paid = await sumTeamPayments(tenantId, input.teamId, tx)
    const pending = pendingFor(team.inscriptionFee, paid)
    if (input.amount > pending) {
      throw new InscriptionOverpaidError(team.name, pending)
    }
  }

  const cashFlow = await createCashFlow(
    tenantId,
    staffUserId,
    {
      type: 'income',
      category: 'tournament',
      amount: input.amount,
      method: input.method,
      description: input.note?.trim()
        ? input.note.trim()
        : `Inscripción — ${team.name}`,
      tournamentTeamId: input.teamId,
      clientIdempotencyKey: input.clientIdempotencyKey,
    },
    tx,
  )

  return {
    id: cashFlow.id,
    teamId: input.teamId,
    amount: cashFlow.amount,
    method: cashFlow.method,
    description: cashFlow.description,
    occurredAt: cashFlow.occurredAt,
  }
}

async function sumTeamPayments(
  tenantId: string,
  teamId: string,
  tx: DbTx,
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::int AS paid FROM cash_flows
    WHERE tenant_id = ${tenantId} AND tournament_team_id = ${teamId}
  `)) as unknown as Array<{ paid: number }>
  return rows[0]?.paid ?? 0
}

/**
 * Guard de borrado: un equipo con plata cobrada no se borra.
 *
 * La FK lo frenaría igual (sin ON DELETE), pero con un 23503 crudo. Y borrarlo
 * en cascada sería peor: dejaría la caja de ese día descuadrada contra el
 * cierre ya firmado. Para un equipo que se bajó está `status = 'withdrawn'`.
 */
export async function assertTeamHasNoPayments(
  tenantId: string,
  teamId: string,
  tx: DbTx,
): Promise<void> {
  const count = await countTeamPayments(tenantId, teamId, tx)
  if (count > 0) throw new TeamHasPaymentsError(count)
}
