import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  claimNotificationForSend,
  markNotificationFailed,
  markNotificationSent,
  updateNotificationLastError,
} from '@/modules/notifications/notification.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

/**
 * Inserts a fresh `queued` notification (attempt_count=0) and returns its id.
 * Each call uses a fresh tenant + player so concurrent iterations stay isolated.
 */
async function insertQueuedNotification(): Promise<string> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql, {
    email: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
  })
  await linkPlayerToTenant(sql, tenant.id, player.id)

  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO notifications (
      tenant_id, recipient_type, recipient_id, channel,
      trigger_event, template_name, content, status, attempt_count
    ) VALUES (
      ${tenant.id}, 'player', ${player.id}, 'email',
      'booking.confirmed', 'booking_confirmation_player',
      ${sql.json({ playerName: 'Test' })},
      'queued', 0
    )
    RETURNING id
  `
  return id
}

async function readNotification(
  id: string,
): Promise<{ status: string; attempt_count: number; last_error: string | null }> {
  const sql = getSql()
  const [row] = await sql<
    { status: string; attempt_count: number; last_error: string | null }[]
  >`
    SELECT status, attempt_count, last_error FROM notifications WHERE id = ${id}
  `
  return row
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterEach(async () => {
  await cleanupAll(getSql())
})

afterAll(async () => closeSql())

describe("notification 'sending' claim state machine", () => {
  it('concurrent claimNotificationForSend → EXACTLY ONE winner per row (single-dispatch invariant)', async () => {
    const ITERATIONS = 50
    const CONCURRENCY = 5

    for (let i = 0; i < ITERATIONS; i++) {
      const id = await insertQueuedNotification()

      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, () => claimNotificationForSend(id, 0)),
      )

      const winners = results.filter((claimed) => claimed === true).length
      expect(winners).toBe(1)

      // The single winner advanced the row out of the queued pool.
      const row = await readNotification(id)
      expect(row.status).toBe('sending')
      expect(row.attempt_count).toBe(1)
    }
  }, 60_000)

  it('markNotificationSent only transitions a sending row (queued row is a no-op)', async () => {
    // Claimed → sending → sent.
    const claimedId = await insertQueuedNotification()
    expect(await claimNotificationForSend(claimedId, 0)).toBe(true)
    await markNotificationSent(claimedId)
    const sent = await readNotification(claimedId)
    expect(sent.status).toBe('sent')

    // Never claimed (still queued) → markSent must NOT advance it.
    const queuedId = await insertQueuedNotification()
    await markNotificationSent(queuedId)
    const stillQueued = await readNotification(queuedId)
    expect(stillQueued.status).toBe('queued')
  })

  it('retry path: claim → sending, updateNotificationLastError returns row to queued and is sweepable', async () => {
    const id = await insertQueuedNotification()
    expect(await claimNotificationForSend(id, 0)).toBe(true)

    const sending = await readNotification(id)
    expect(sending.status).toBe('sending')
    expect(sending.attempt_count).toBe(1)

    await updateNotificationLastError(id, 'err', 1)

    const requeued = await readNotification(id)
    expect(requeued.status).toBe('queued')
    expect(requeued.attempt_count).toBe(1)
    expect(requeued.last_error).toBe('err')

    // Sweepable again: a re-claim at the new attempt_count succeeds.
    expect(await claimNotificationForSend(id, 1)).toBe(true)
    const reclaimed = await readNotification(id)
    expect(reclaimed.status).toBe('sending')
    expect(reclaimed.attempt_count).toBe(2)
  })

  it('final failure: claim → sending, markNotificationFailed → failed', async () => {
    const id = await insertQueuedNotification()
    expect(await claimNotificationForSend(id, 0)).toBe(true)

    await markNotificationFailed(id, 'boom')

    const failed = await readNotification(id)
    expect(failed.status).toBe('failed')
    expect(failed.last_error).toBe('boom')
  })
})
