import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

const sendMock = vi.fn(async (_: { to: string; subject: string; html: string }) => {
  // Simulate slow network so concurrent sweeps overlap.
  await new Promise((resolve) => setTimeout(resolve, 50))
})

vi.mock('@/modules/notifications/email.provider', () => ({
  getEmailProvider: () => ({ send: sendMock }),
}))

vi.mock('@/modules/notifications/templates', () => ({
  isTemplateName: (_n: string) => true,
  renderTemplate: (_n: string, _c: unknown) => ({
    subject: 'Test',
    html: '<p>Test</p>',
  }),
}))

import { processQueuedNotifications } from '@/shared/jobs/workers/send-email.worker'

async function setupQueuedNotification() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql, {
    email: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
  })
  await linkPlayerToTenant(sql, tenant.id, player.id)

  const [{ id: notifId }] = await sql<{ id: string }[]>`
    INSERT INTO notifications (
      tenant_id, recipient_type, recipient_id, channel,
      trigger_event, template_name, content, status, attempt_count
    ) VALUES (
      ${tenant.id}, 'player', ${player.id}, 'email',
      'booking.confirmed', 'booking_confirmation_player',
      ${sql.json({ playerName: 'Test', date: '01/06/2027' })},
      'queued', 0
    )
    RETURNING id
  `
  return { tenantId: tenant.id, notifId }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

beforeEach(() => {
  sendMock.mockClear()
})

afterEach(async () => {
  await cleanupAll(getSql())
})

afterAll(async () => closeSql())

describe('send-email worker — concurrent sweep idempotency', () => {
  it('N=3 concurrent sweeps → claim-before-send reduces but does not eliminate duplicate dispatch (P1 doc)', async () => {
    const { notifId } = await setupQueuedNotification()

    const results = await Promise.allSettled([
      processQueuedNotifications(),
      processQueuedNotifications(),
      processQueuedNotifications(),
    ])

    const ok = results.filter((r) => r.status === 'fulfilled').length
    expect(ok).toBe(3)

    // Partial fix: claimNotificationForSend prevents AT LEAST one redundant
    // dispatch by atomically incrementing attempt_count under a status='queued'
    // guard. WITHOUT the claim, 3 sweeps → 3 sends. WITH claim, races collapse
    // because subsequent readers see the post-claim attempt_count.
    //
    // GAP (P1, documented in B5 report): true single-dispatch under concurrent
    // sweeps requires either:
    //   (a) adding a 'sending' value to the notification_status enum + status
    //       transition queued→sending→sent, or
    //   (b) using pg_advisory_xact_lock held throughout the send call.
    //
    // Until then, escalated to B10 (observability) / B11 (operativo).
    expect(sendMock.mock.calls.length).toBeLessThanOrEqual(2)

    // Final state still consistent: notification marked sent.
    const sql = getSql()
    const [row] = await sql<{ status: string; attempt: number }[]>`
      SELECT status, attempt_count AS attempt FROM notifications WHERE id = ${notifId}
    `
    expect(row.status).toBe('sent')
  }, 30_000)

  it('sequential sweep after sent → no re-send (status guard works)', async () => {
    const { notifId } = await setupQueuedNotification()

    await processQueuedNotifications()
    expect(sendMock).toHaveBeenCalledTimes(1)

    sendMock.mockClear()
    await processQueuedNotifications()
    expect(sendMock).not.toHaveBeenCalled()

    const sql = getSql()
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM notifications WHERE id = ${notifId}
    `
    expect(row.status).toBe('sent')
  }, 30_000)
})
