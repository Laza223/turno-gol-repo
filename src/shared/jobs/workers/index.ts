import type PgBoss from 'pg-boss'
import { registerMpWebhookWorker } from './process-mp-webhook.worker'
import { registerGenerateAbonadoSlotsWorker } from './generate-abonado-slots.worker'
import { registerSendEmailWorker } from './send-email.worker'
import { registerExpireTrialsWorker } from './expire-trials.worker'
import { registerAutoCompleteBookingsWorker } from './auto-complete-bookings.worker'
import { registerDunningRetryWorker } from './dunning-retry.worker'
import { registerDataRetentionCleanupWorker } from './data-retention-cleanup.worker'
import { registerExpirePendingBookingWorker } from './expire-pending-booking.worker'
import { registerRefreshMpTokensWorker } from './refresh-mp-tokens.worker'
import { registerReconcilePendingPaymentsWorker } from './reconcile-pending-payments.worker'
import { registerReconcileAccountingDriftWorker } from './reconcile-accounting-drift.worker'
import { registerRetryRefundsWorker } from './retry-refunds.worker'
import { registerPushSendWorker } from './push.worker'
import { registerHealthPingWorker } from './health-ping.worker'
import { registerDailySummaryWorker } from './daily-summary.worker'
import { attachFailureHandlers } from '../dlq'

export async function registerAllWorkers(boss: PgBoss): Promise<void> {
  await registerMpWebhookWorker(boss)
  await registerGenerateAbonadoSlotsWorker(boss)
  await registerSendEmailWorker(boss)
  await registerExpireTrialsWorker(boss)
  await registerAutoCompleteBookingsWorker(boss)
  await registerDunningRetryWorker(boss)
  await registerDataRetentionCleanupWorker(boss)
  await registerExpirePendingBookingWorker(boss)
  await registerRefreshMpTokensWorker(boss)
  await registerReconcilePendingPaymentsWorker(boss)
  await registerReconcileAccountingDriftWorker(boss)
  await registerRetryRefundsWorker(boss)
  await registerPushSendWorker(boss)
  await registerHealthPingWorker(boss)
  await registerDailySummaryWorker(boss)
  // DLQ visibility (B10 T7): emit Sentry + structured log when a job exhausts
  // retries and fails. Must be last so every worker's queue exists first.
  await attachFailureHandlers(boss)
}
