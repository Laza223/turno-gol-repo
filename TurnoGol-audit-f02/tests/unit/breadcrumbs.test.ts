import { describe, expect, it, vi, beforeEach } from 'vitest'

const addBreadcrumb = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (args: unknown) => addBreadcrumb(args),
}))

import { track } from '@/shared/observability/breadcrumbs'

beforeEach(() => {
  addBreadcrumb.mockClear()
})

describe('track.booking', () => {
  it('emits breadcrumb with category=booking and given event as message', () => {
    track.booking('booking.online.create.start', {
      tenantId: 'tenant-1',
      courtId: 'court-1',
      playerId: 'player-1',
    })
    expect(addBreadcrumb).toHaveBeenCalledTimes(1)
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'booking',
      message: 'booking.online.create.start',
      data: { tenantId: 'tenant-1', courtId: 'court-1', playerId: 'player-1' },
      level: 'info',
    })
  })
})

describe('track.payment', () => {
  it('emits breadcrumb with category=payment', () => {
    track.payment('payment.deposit.approved', {
      paymentId: 'p-1',
      mpPaymentId: '12345',
      amountCents: 100000,
    })
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'payment',
      message: 'payment.deposit.approved',
      data: { paymentId: 'p-1', mpPaymentId: '12345', amountCents: 100000 },
      level: 'info',
    })
  })
})

describe('track.webhook', () => {
  it('emits breadcrumb with category=webhook', () => {
    track.webhook('mp.webhook.received', {
      mpEventId: 'evt-1',
      eventType: 'payment',
    })
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'webhook',
      message: 'mp.webhook.received',
      data: { mpEventId: 'evt-1', eventType: 'payment' },
      level: 'info',
    })
  })
})
