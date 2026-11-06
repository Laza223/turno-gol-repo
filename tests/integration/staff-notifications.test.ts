import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { sendPushNotification } from '@/lib/web-push'
import {
  enqueueStaffNotification,
  getStaffPushDeliveryStatus,
  isStaffNotificationsEnabled,
  processQueuedStaffNotifications,
} from '@/modules/notifications/staff-notification.service'
import { sendStaffPushDelivery } from '@/modules/notifications/staff-push-delivery.service'
import { recordPushReceipt } from '@/modules/notifications/push-receipt.service'
import type { StaffNotificationEvent } from '@/modules/notifications/staff-notification.types'
import type { PushSendJobData } from '@/shared/jobs/definitions'
import {
  asApp,
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const { queued } = vi.hoisted(() => ({ queued: [] as PushSendJobData[] }))
vi.mock('@/lib/web-push', () => ({ sendPushNotification: vi.fn() }))
vi.mock('@/shared/jobs/boss', () => ({
  getBoss: async () => ({
    send: async (_queue: string, data: PushSendJobData) => {
      queued.push(data)
      return randomUUID()
    },
  }),
}))

beforeAll(async () => {
  await getSql()`SELECT 1`
  await ensureRoles()
  await cleanupAll()
})
afterAll(async () => {
  await closeSql()
})
beforeEach(() => {
  queued.length = 0
  vi.mocked(sendPushNotification).mockReset().mockResolvedValue({ success: true, statusCode: 201 })
  vi.stubEnv('PUSH_RECEIPT_SECRET', 'test-receipt-secret-at-least-thirty-two-bytes')
})

async function setup(deviceCount: number, role: 'admin' | 'manager' = 'admin') {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id, role)
  const subscriptions: string[] = []
  for (let i = 0; i < deviceCount; i++) {
    const rows = await sql<
      { id: string }[]
    >`INSERT INTO push_subscriptions(tenant_id,staff_user_id,endpoint,p256dh_key,auth_key)
      VALUES (${tenant.id},${staff.id},${`https://web.push.apple.com/${randomUUID()}`},'public-key','auth-key') RETURNING id`
    subscriptions.push(rows[0]!.id)
  }
  const event: StaffNotificationEvent = {
    tenantId: tenant.id,
    eventKey: randomUUID(),
    type: 'test',
    audience: 'staff',
    policy: 'push_preferred',
    payload: { type: 'test', title: 'Nueva reserva', body: 'Cancha 1 · 20:00' },
    email: {
      templateName: 'admin_new_booking',
      content: {
        courtName: 'Cancha 1',
        date: 'hoy',
        timeStart: '20:00',
        timeEnd: '21:00',
        playerName: 'Jugador',
      },
    },
    expiresAt: new Date(Date.now() + 60 * 60_000),
  }
  return { tenant, staff, subscriptions, event }
}

async function enqueue(event: StaffNotificationEvent) {
  return withTenantContext(event.tenantId, (tx) => enqueueStaffNotification(event, tx))
}

async function runQueued(tenantId: string) {
  const sql = getSql()
  // Logs operacionales son deny-all para la app; esta lectura es deliberadamente administrativa.
  const jobs = await sql<
    { notification_id: string; dedupe_key: string; subscription_id: string }[]
  >`
    SELECT d.notification_id,d.dedupe_key,d.subscription_id FROM push_send_log d JOIN notifications n ON n.id = d.notification_id
    WHERE n.tenant_id = ${tenantId} AND d.status IN ('queued','sending')`
  for (const job of jobs)
    await sendStaffPushDelivery(job.notification_id, job.dedupe_key, job.subscription_id)
}

async function emails(tenantId: string) {
  return asApp(
    tenantId,
    (tx) =>
      tx<
        { recipient_id: string }[]
      >`SELECT recipient_id FROM notifications WHERE tenant_id = ${tenantId} AND channel = 'email'`,
  )
}

describe('staff notifications — transactional outbox and recipient fallback', () => {
  it('rolls back with business state, dedupes and includes more than five active staff', async () => {
    const { tenant, event } = await setup(0)
    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await enqueueStaffNotification(event, tx)
        throw new Error('business rollback')
      }),
    ).rejects.toThrow('business rollback')
    expect(
      await asApp(tenant.id, (tx) => tx`SELECT id FROM notifications WHERE tenant_id=${tenant.id}`),
    ).toHaveLength(0)
    for (let i = 0; i < 5; i++) {
      const staff = await createTestStaffUser()
      await linkStaffToTenant(getSql(), tenant.id, staff.id)
    }
    expect(await enqueue(event)).toHaveLength(6)
    expect(await enqueue(event)).toHaveLength(0)
  })

  it('uses mail only for the person without devices; accepted push never falls back without a receipt', async () => {
    const { tenant, staff, event } = await setup(1)
    const other = await createTestStaffUser()
    await linkStaffToTenant(getSql(), tenant.id, other.id, 'manager')
    await enqueue(event)
    await processQueuedStaffNotifications()
    expect(await emails(tenant.id)).toEqual([{ recipient_id: other.id }])
    await runQueued(tenant.id)
    await processQueuedStaffNotifications()
    await processQueuedStaffNotifications()
    expect(await emails(tenant.id)).toEqual([{ recipient_id: other.id }])
    expect((await emails(tenant.id)).some((e) => e.recipient_id === staff.id)).toBe(false)
  })

  it('one accepted device suppresses backup even if another fails definitively', async () => {
    const { tenant, event } = await setup(2)
    vi.mocked(sendPushNotification).mockResolvedValueOnce({
      success: false,
      gone: true,
      statusCode: 410,
    })
    await enqueue(event)
    await processQueuedStaffNotifications()
    await runQueued(tenant.id)
    await processQueuedStaffNotifications()
    expect(sendPushNotification).toHaveBeenCalledTimes(2)
    expect(await emails(tenant.id)).toHaveLength(0)
  })

  it('all expired devices produce one backup and are cleaned up', async () => {
    const { tenant, event } = await setup(2)
    vi.mocked(sendPushNotification).mockResolvedValue({
      success: false,
      gone: true,
      statusCode: 404,
    })
    await enqueue(event)
    await processQueuedStaffNotifications()
    await runQueued(tenant.id)
    await processQueuedStaffNotifications()
    await processQueuedStaffNotifications()
    expect(await emails(tenant.id)).toHaveLength(1)
    expect(
      await asApp(
        tenant.id,
        (tx) => tx`SELECT id FROM push_subscriptions WHERE tenant_id=${tenant.id}`,
      ),
    ).toHaveLength(0)
  })

  it('keeps sending to other devices after the first acceptance', async () => {
    const { tenant, event } = await setup(2)
    const [notificationId] = await enqueue(event)
    await processQueuedStaffNotifications()
    // Estado operacional deny-all: el administrador de tests observa los trabajos.
    const jobs = await getSql()<{ dedupe_key: string; subscription_id: string }[]>`
      SELECT dedupe_key,subscription_id FROM push_send_log WHERE notification_id=${notificationId!} ORDER BY dedupe_key`
    await sendStaffPushDelivery(notificationId!, jobs[0]!.dedupe_key, jobs[0]!.subscription_id)
    await processQueuedStaffNotifications()
    const states = await asApp(
      tenant.id,
      (tx) =>
        tx<{ status: string }[]>`SELECT status FROM notifications WHERE id=${notificationId!}`,
    )
    expect(states[0]?.status).toBe('sending')
    vi.mocked(sendPushNotification).mockResolvedValueOnce({
      success: false,
      gone: true,
      statusCode: 410,
    })
    await sendStaffPushDelivery(notificationId!, jobs[1]!.dedupe_key, jobs[1]!.subscription_id)
    await processQueuedStaffNotifications()
    expect(sendPushNotification).toHaveBeenCalledTimes(2)
    expect(await emails(tenant.id)).toHaveLength(0)
  })

  it('applies quiet hours to a future requested send and does not fall back while scheduled', async () => {
    const { tenant, event } = await setup(0)
    const requested = new Date()
    requested.setUTCDate(requested.getUTCDate() + 1)
    requested.setUTCHours(4, 0, 0, 0)
    const [id] = await enqueue({
      ...event,
      type: 'booking.confirmed_online',
      notBefore: requested,
      expiresAt: new Date(requested.getTime() + 12 * 60 * 60_000),
    })
    await processQueuedStaffNotifications()
    const rows = await asApp(
      tenant.id,
      (tx) => tx<{ available_at: Date }[]>`SELECT available_at FROM notifications WHERE id=${id!}`,
    )
    expect(new Date(rows[0]!.available_at).getUTCHours()).toBe(11)
    expect(await emails(tenant.id)).toHaveLength(0)
  })

  it('never emails a push-only agenda or an expired event', async () => {
    const { tenant, event } = await setup(0)
    await enqueue({ ...event, policy: 'push_only' })
    await enqueue({ ...event, eventKey: randomUUID(), expiresAt: new Date(Date.now() - 1) })
    await processQueuedStaffNotifications()
    expect(await emails(tenant.id)).toHaveLength(0)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('recovers a stale sending lease and does not send accepted deliveries twice', async () => {
    const { tenant, event } = await setup(1)
    await enqueue(event)
    await processQueuedStaffNotifications()
    // Estado interno del worker: sólo el administrador de test puede simular su caída.
    await getSql()`UPDATE push_send_log SET status='sending',attempt_count=1,lease_until=now()-interval '1 minute'
      WHERE notification_id IN (SELECT id FROM notifications WHERE tenant_id=${tenant.id})`
    await runQueued(tenant.id)
    await runQueued(tenant.id)
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
  })

  it('rejects a queued delivery after membership deactivation without sending a backup', async () => {
    const { tenant, staff, event } = await setup(1)
    await enqueue(event)
    await processQueuedStaffNotifications()
    await getSql()`UPDATE tenant_staff_members SET is_active=false WHERE tenant_id=${tenant.id} AND staff_user_id=${staff.id}`
    await runQueued(tenant.id)
    await processQueuedStaffNotifications()
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(await emails(tenant.id)).toHaveLength(0)
  })

  it('records signed device receipts, preserves stages and isolates status across tenants', async () => {
    const { tenant, staff, subscriptions, event } = await setup(1)
    await enqueue(event)
    await processQueuedStaffNotifications()
    await runQueued(tenant.id)
    const payload = vi.mocked(sendPushNotification).mock.calls[0]![1]
    expect(
      await recordPushReceipt(String(payload.deliveryId), String(payload.receiptToken), 'opened'),
    ).toBe(true)
    expect(
      await recordPushReceipt(
        String(payload.deliveryId),
        String(payload.receiptToken),
        'processed',
      ),
    ).toBe(true)
    const state = await getStaffPushDeliveryStatus(tenant.id, staff.id, subscriptions[0]!)
    expect(state.acceptedAt).not.toBeNull()
    expect(state.processedAt).not.toBeNull()
    expect(state.openedAt).not.toBeNull()
    expect(await getStaffPushDeliveryStatus(randomUUID(), staff.id, subscriptions[0]!)).toEqual({
      acceptedAt: null,
      processedAt: null,
      openedAt: null,
    })
  })

  it('resolves flags in the current transaction and isolates the agenda state with RLS', async () => {
    const { tenant } = await setup(0)
    const other = await createTestTenant()
    expect(
      await withTenantContext(tenant.id, (tx) => isStaffNotificationsEnabled(tenant.id, tx)),
    ).toBe(false)
    await getSql()`INSERT INTO feature_flags(key,value,tenant_id) VALUES ('staff_notifications_v2',true,${tenant.id})`
    expect(
      await withTenantContext(tenant.id, (tx) => isStaffNotificationsEnabled(tenant.id, tx)),
    ).toBe(true)
    await getSql()`INSERT INTO staff_agenda_state(tenant_id,operating_date) VALUES (${tenant.id},CURRENT_DATE)`
    expect(
      await asApp(
        other.id,
        (tx) => tx`SELECT tenant_id FROM staff_agenda_state WHERE tenant_id=${tenant.id}`,
      ),
    ).toHaveLength(0)
    await expect(
      asApp(
        other.id,
        (tx) =>
          tx`INSERT INTO staff_agenda_state(tenant_id,operating_date) VALUES (${tenant.id},CURRENT_DATE)`,
      ),
    ).rejects.toThrow()
  })
})
