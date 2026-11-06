import { beforeEach, describe, expect, it, vi } from 'vitest'

const { enabled, enqueue } = vi.hoisted(() => ({ enabled: vi.fn(), enqueue: vi.fn() }))
vi.mock('@/modules/notifications/staff-notification.service', () => ({
  isStaffNotificationsEnabled: enabled,
  enqueueStaffNotification: enqueue,
}))

import { enqueueStaffTemplateNotification } from '@/modules/notifications/staff-template-notification'
import type { DbTx } from '@/shared/db/client'

const tx = {} as DbTx
const base = {
  tenantId: 'tenant-1',
  templateName: 'admin_late_payment' as const,
  triggerEvent: 'booking.late_payment_attempt',
  content: { bookingId: 'booking-1', amountArs: '3.000', notificationEventKey: 'payment-1' },
}

beforeEach(() => {
  enabled.mockResolvedValue(true)
  enqueue.mockResolvedValue(['intent-1'])
})

describe('staff template channel policy', () => {
  it('preserves legacy email when the tenant flag is off', async () => {
    enabled.mockResolvedValue(false)
    expect(await enqueueStaffTemplateNotification(base, tx)).toBeNull()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('does not reroute welcome, player or optional weekly emails', async () => {
    for (const templateName of ['trial_welcome', 'booking_confirmed', 'daily_summary'] as const) {
      expect(await enqueueStaffTemplateNotification({ ...base, templateName }, tx)).toBeNull()
    }
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('routes operational money alerts to authorized staff with one email fallback policy', async () => {
    expect(await enqueueStaffTemplateNotification(base, tx)).toEqual(['intent-1'])
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: 'booking.late_payment_attempt:payment-1',
        audience: 'staff',
        policy: 'push_preferred',
        email: { templateName: 'admin_late_payment', content: base.content },
        payload: expect.objectContaining({ url: '/caja/cuentas' }),
      }),
      tx,
    )
  })

  it('preserves an explicit owner-only restriction on financial alerts', async () => {
    await enqueueStaffTemplateNotification(
      { ...base, templateName: 'admin_external_refund_detected' },
      tx,
      { onlyRole: 'admin' },
    )
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ audience: 'owners' }), tx)
  })

  it('conserves the plan email alongside the push', async () => {
    await enqueueStaffTemplateNotification({ ...base, templateName: 'trial_expired' }, tx)
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ audience: 'owners', policy: 'email_and_push' }),
      tx,
    )
  })

  it('keeps distinct payment instances separate while retries keep the same key', async () => {
    await enqueueStaffTemplateNotification(base, tx)
    await enqueueStaffTemplateNotification(base, tx)
    await enqueueStaffTemplateNotification(
      { ...base, content: { ...base.content, notificationEventKey: 'payment-2' } },
      tx,
    )
    expect(enqueue.mock.calls.map(([event]) => event.eventKey)).toEqual([
      'booking.late_payment_attempt:payment-1',
      'booking.late_payment_attempt:payment-1',
      'booking.late_payment_attempt:payment-2',
    ])
  })
})
