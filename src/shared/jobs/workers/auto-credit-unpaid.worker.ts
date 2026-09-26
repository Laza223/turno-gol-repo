import type PgBoss from 'pg-boss'
import { getWorkerDb } from '@/shared/db/client'
import { insertSystemAuditLogs } from '@/shared/db/audit'
import { autoCreditBooking, findAutoCreditCandidates } from '@/modules/bookings/booking.auto-credit'
import { getFirstActiveAdminStaffUserId } from '@/modules/staff/staff.service'
import { captureException, captureMessage } from '@/lib/sentry'
import { logger } from '@/shared/lib/logger'
import { CRON_WORK_OPTIONS, QUEUE_AUTO_CREDIT_UNPAID } from '../definitions'

export type AutoCreditSweepResult = { credited: number; totalCents: number; skipped: number }

/**
 * Acredita en efectivo los turnos jugados que siguen sin cobro registrado 24 h
 * después de terminar (`booking.auto-credit.ts`, decisión del dueño del
 * 2026-09-26). Cross-tenant: pool del worker (BYPASSRLS), igual que
 * auto-complete-bookings.
 *
 * Cada turno va en su propia transacción: si uno falla, los demás se
 * acreditan igual y el que falló se reintenta en la próxima hora (el cron no
 * tiene retry propio). Un complejo sin admin activo se saltea con un aviso a
 * Sentry: la fila de plata necesita un `registered_by`.
 */
export async function runAutoCreditUnpaid(): Promise<AutoCreditSweepResult> {
  const db = getWorkerDb()
  const candidates = await db.transaction((tx) => findAutoCreditCandidates(tx))

  const result: AutoCreditSweepResult = { credited: 0, totalCents: 0, skipped: 0 }
  const staffByTenant = new Map<string, string | null>()

  for (const { tenantId, bookingId } of candidates) {
    if (!staffByTenant.has(tenantId)) {
      staffByTenant.set(tenantId, await getFirstActiveAdminStaffUserId(tenantId))
    }
    const staffUserId = staffByTenant.get(tenantId)
    if (!staffUserId) {
      result.skipped++
      captureMessage('auto-credit skipped: no active admin to attribute it to', {
        level: 'warning',
        extra: { tenantId, bookingId },
      })
      continue
    }

    try {
      const cents = await db.transaction(async (tx) => {
        const credited = await autoCreditBooking(tenantId, bookingId, staffUserId, tx)
        if (credited > 0) {
          await insertSystemAuditLogs(tx, [
            {
              tenantId,
              action: 'booking.auto_credited',
              resourceType: 'booking',
              resourceId: bookingId,
              metadata: { amountCents: credited, method: 'cash' },
            },
          ])
        }
        return credited
      })
      if (cents > 0) {
        result.credited++
        result.totalCents += cents
      }
    } catch (err) {
      result.skipped++
      captureException(err, { extra: { tenantId, bookingId, module: 'auto-credit-unpaid' } })
    }
  }

  if (result.credited > 0 || result.skipped > 0) {
    logger.info('auto-credited unpaid bookings', { module: 'auto-credit-unpaid', ...result })
  }
  return result
}

export async function registerAutoCreditUnpaidWorker(boss: PgBoss): Promise<void> {
  // A los 15 de cada hora: lejos del :00 y del :30 de auto-complete-bookings,
  // que es quien pasa los turnos a `completed`.
  await boss.schedule(QUEUE_AUTO_CREDIT_UNPAID, '15 * * * *', {})
  await boss.work(QUEUE_AUTO_CREDIT_UNPAID, CRON_WORK_OPTIONS, async () => {
    await runAutoCreditUnpaid()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_AUTO_CREDIT_UNPAID })
}
