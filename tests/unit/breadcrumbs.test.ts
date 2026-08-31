import { describe, expect, it, vi, beforeEach } from 'vitest'

const addBreadcrumb = vi.fn()
const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (args: unknown) => addBreadcrumb(args),
  // `emit` avisa por Sentry cuando no hay sink de analytics registrado (F-022).
  // El mock lo exporta para ser fiel al módulo real: sin esto el primer `track.*`
  // de la suite explota con "No captureMessage export is defined".
  captureMessage: (msg: unknown, level: unknown) => captureMessage(msg, level),
}))

import { setAnalyticsSink, track } from '@/shared/observability/breadcrumbs'

beforeEach(() => {
  addBreadcrumb.mockClear()
  captureMessage.mockClear()
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
    track.search('search.public.query', {
      hasQuery: true,
      city: 'La Plata',
      onlineOnly: true,
      results: 7,
    })
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

/**
 * 🔴 F-022 (QA de producción 2026-08-17): `analytics_events` quedaba vacía en
 * producción porque el sink vivía en una variable de módulo y
 * `instrumentation.ts` seteaba OTRA copia del módulo que la que leían los
 * servicios. Estos tests fijan las dos mitades del arreglo: el sink se comparte
 * por `globalThis` (o sea, sobrevive a que haya más de una copia del módulo), y
 * su ausencia deja rastro en vez de descartar el evento en silencio.
 */
describe('sink de analytics', () => {
  it('entrega el evento al sink registrado', () => {
    const sink = vi.fn()
    setAnalyticsSink(sink)
    track.search('search.public.query', { hasQuery: true, results: 3 })
    expect(sink).toHaveBeenCalledWith('search', 'search.public.query', {
      hasQuery: true,
      results: 3,
    })
    setAnalyticsSink(null)
  })

  it('comparte el sink por globalThis, no por la copia del módulo', () => {
    const sink = vi.fn()
    setAnalyticsSink(sink)
    expect(
      (globalThis as { __turnogol_analytics_sink__?: unknown }).__turnogol_analytics_sink__,
    ).toBe(sink)
    setAnalyticsSink(null)
  })

  it('avisa por Sentry cuando no hay sink, en vez de descartar en silencio', async () => {
    // Import fresco a propósito: el aviso sale UNA vez por instancia del módulo,
    // y los `track.*` de los describes de arriba ya consumieron el de esta copia.
    // Sin `resetModules` el test pasaría o fallaría según el orden de ejecución.
    setAnalyticsSink(null)
    vi.resetModules()
    captureMessage.mockClear()
    const fresh = await import('@/shared/observability/breadcrumbs')

    fresh.track.search('search.public.query', { hasQuery: true, results: 1 })
    // Una sola vez por instancia: el aviso es una alarma, no un log por evento.
    fresh.track.search('search.public.query', { hasQuery: true, results: 2 })

    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(captureMessage).toHaveBeenCalledWith(
      'analytics sink no registrado: los eventos no se persisten',
      'warning',
    )
  })
})
