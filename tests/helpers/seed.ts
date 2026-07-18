import type { Sql } from 'postgres'
import { createTestPlayer, createTestStaffUser, linkPlayerToTenant, linkStaffToTenant } from './tenant'
import {
  getOrCreatePlanId,
  insertAbonado,
  insertAuditLog,
  insertBan,
  insertBooking,
  insertCashFlow,
  insertCourt,
  insertDailyCashClose,
  insertNotification,
  insertPayment,
  insertSubscription,
} from './factories'

export type IsolationSeed = {
  tenantId: string
  staffUserId: string
  staffMemberId: string
  playerId: string
  ptrId: string
  courtId: string
  abonadoId: string
  bookingId: string
  paymentId: string
  cashFlowId: string
  dailyCashCloseId: string
  subscriptionId: string
  banId: string
  notificationId: string
  auditLogId: string
}

/**
 * Inserts 1 row in every RLS-protected table for a given tenant.
 * Run as superuser (no SET ROLE) — bypasses RLS so seed always succeeds.
 * Returns the IDs needed by isolation tests.
 */
export async function seedIsolationData(
  sql: Sql,
  tenantId: string,
): Promise<IsolationSeed> {
  const staff = await createTestStaffUser(sql)
  const staffMemberId = await linkStaffToTenant(sql, tenantId, staff.id)

  const player = await createTestPlayer(sql)
  const ptrId = await linkPlayerToTenant(sql, tenantId, player.id)

  const courtId = await insertCourt(sql, tenantId)
  const abonadoId = await insertAbonado(sql, tenantId, courtId)
  const bookingId = await insertBooking(sql, { tenantId, courtId, playerId: player.id })
  const paymentId = await insertPayment(sql, { tenantId, bookingId, playerId: player.id })
  const cashFlowId = await insertCashFlow(sql, { tenantId, registeredBy: staff.id, bookingId })
  const dailyCashCloseId = await insertDailyCashClose(sql, { tenantId, closedBy: staff.id })
  const planId = await getOrCreatePlanId(sql)
  const subscriptionId = await insertSubscription(sql, { tenantId, planId })
  const banId = await insertBan(sql, { tenantId, playerId: player.id, bannedBy: staff.id })
  const notificationId = await insertNotification(sql, {
    tenantId,
    recipientType: 'player',
    recipientId: player.id,
  })
  const auditLogId = await insertAuditLog(sql, {
    tenantId,
    actorId: staff.id,
    actorType: 'staff',
    resourceId: bookingId,
  })

  return {
    tenantId,
    staffUserId: staff.id,
    staffMemberId,
    playerId: player.id,
    ptrId,
    courtId,
    abonadoId,
    bookingId,
    paymentId,
    cashFlowId,
    dailyCashCloseId,
    subscriptionId,
    banId,
    notificationId,
    auditLogId,
  }
}
