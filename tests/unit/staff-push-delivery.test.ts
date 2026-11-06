import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWorkerSql } from '@/shared/db/client'
import { sendPushNotification } from '@/lib/web-push'
import { sendStaffPushDelivery } from '@/modules/notifications/staff-push-delivery.service'

vi.mock('@/shared/db/client', () => ({ getWorkerSql: vi.fn() }))
vi.mock('@/lib/web-push', () => ({ sendPushNotification: vi.fn() }))
vi.mock('@/shared/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const delivery = () => ({
  content: {
    payload: { type: 'test', title: 'Prueba' },
    audience: 'staff',
    policy: 'push_only',
    subscriptionId: 'device-1',
  },
  expires_at: new Date(Date.now() + 60_000),
  tenant_id: 'tenant-1',
  endpoint: 'https://web.push.apple.com/test',
  p256dh_key: 'key',
  auth_key: 'auth',
  attempt_count: 1,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PUSH_RECEIPT_SECRET', 'test-receipt-secret-at-least-thirty-two-bytes')
})

describe('staff push delivery', () => {
  it('defers a retry crossing midnight to 08:00 without contacting the provider', async () => {
    const midnight = new Date()
    midnight.setUTCHours(3, 1, 0, 0)
    vi.useFakeTimers({ toFake: ['Date'], now: midnight })
    try {
      const row = delivery()
      row.content.payload.type = 'booking.confirmed_online'
      const sql = vi.fn().mockResolvedValueOnce([row]).mockResolvedValue([])
      vi.mocked(getWorkerSql).mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)
      await sendStaffPushDelivery('notification-1', 'delivery-1', 'device-1')
      expect(sendPushNotification).not.toHaveBeenCalled()
      expect(sql).toHaveBeenCalledTimes(3)
      expect(
        sql.mock.calls.flat().some((value) => value instanceof Date && value.getUTCHours() === 11),
      ).toBe(true)
      expect(sql.mock.calls[1]![0].join(' ')).toContain('attempt_count - 1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not contact the provider when the atomic claim rejects the job', async () => {
    vi.mocked(getWorkerSql).mockReturnValue(
      vi.fn(async () => []) as unknown as ReturnType<typeof getWorkerSql>,
    )
    await sendStaffPushDelivery('notification-1', 'delivery-1', 'device-1')
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('adds a signed receipt capability without leaking private routing filters', async () => {
    const sql = vi.fn().mockResolvedValueOnce([delivery()]).mockResolvedValue([])
    vi.mocked(getWorkerSql).mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)
    vi.mocked(sendPushNotification).mockResolvedValue({ success: true, statusCode: 201 })
    await sendStaffPushDelivery('notification-1', 'delivery-1', 'device-1')
    const payload = vi.mocked(sendPushNotification).mock.calls[0]![1]
    expect(payload).toMatchObject({
      eventId: 'notification-1',
      deliveryId: 'delivery-1',
      receiptUrl: '/api/public/push/receipt',
    })
    expect(typeof payload.receiptToken).toBe('string')
    expect(payload.subscriptionId).toBeUndefined()
    expect(payload.policy).toBeUndefined()
    expect(sql).toHaveBeenCalledTimes(3)
  })

  it('releases an interrupted send for a subsequent attempt and reports the failure', async () => {
    const sql = vi.fn().mockResolvedValueOnce([delivery()]).mockResolvedValue([])
    vi.mocked(getWorkerSql).mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)
    vi.mocked(sendPushNotification).mockRejectedValue(new Error('provider unavailable'))
    await expect(sendStaffPushDelivery('notification-1', 'delivery-1', 'device-1')).rejects.toThrow(
      'provider unavailable',
    )
    const query = (sql.mock.calls[1]![0] as TemplateStringsArray).join(' ')
    expect(query).toContain("next_attempt_at = now() + interval '30 seconds'")
    expect(query).toContain('accepted_at IS NULL')
  })
})
