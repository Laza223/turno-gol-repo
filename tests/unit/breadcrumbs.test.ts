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

describe('track.availability', () => {
  it('emits breadcrumb with category=availability', () => {
    track.availability('availability.public.query', { tenantId: 't-1', date: '2026-06-01' })
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'availability',
      message: 'availability.public.query',
      data: { tenantId: 't-1', date: '2026-06-01' },
      level: 'info',
    })
  })
})

describe('track.search', () => {
  it('emits breadcrumb with category=search and no raw query text (PII-safe)', () => {
    track.search('search.public.query', { hasQuery: true, city: 'La Plata', onlineOnly: true, results: 7 })
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'search',
      message: 'search.public.query',
      data: { hasQuery: true, city: 'La Plata', onlineOnly: true, results: 7 },
      level: 'info',
    })
  })
})

describe('track.auth', () => {
  it('emits a login breadcrumb with category=auth', () => {
    track.auth('staff.login', { staffUserId: 's-1', tenantCount: 1 })
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'auth',
      message: 'staff.login',
      data: { staffUserId: 's-1', tenantCount: 1 },
      level: 'info',
    })
  })
})
