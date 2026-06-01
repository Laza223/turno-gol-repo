import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import {
  isForbiddenCrossSiteMutation,
  isSensitiveMutationPath,
} from '@/shared/security/fetch-metadata'
import { middleware } from '../../middleware'

describe('isSensitiveMutationPath', () => {
  it.each([
    '/api/billing/cancel',
    '/api/billing/subscribe',
    '/api/bookings',
    '/api/bookings/abc-123/cancel',
    '/api/bookings/abc-123/no-show',
    '/api/player/bookings/abc-123/cancel',
  ])('protects %s', (path) => {
    expect(isSensitiveMutationPath(path)).toBe(true)
  })

  it.each([
    '/api/webhooks/mercadopago', // legit cross-site POST from MP
    '/api/mp/callback', // legit cross-site OAuth navigation
    '/api/auth/callback', // legit cross-site magic-link navigation
    '/api/public/availability',
    '/api/csp-report',
    '/api/billingX', // must not prefix-match past a boundary
  ])('does not protect %s', (path) => {
    expect(isSensitiveMutationPath(path)).toBe(false)
  })
})

describe('isForbiddenCrossSiteMutation', () => {
  it('blocks a cross-site mutation', () => {
    expect(isForbiddenCrossSiteMutation('POST', 'cross-site')).toBe(true)
    expect(isForbiddenCrossSiteMutation('delete', 'cross-site')).toBe(true)
  })

  it('allows same-origin / same-site / none / absent (no false positives)', () => {
    expect(isForbiddenCrossSiteMutation('POST', 'same-origin')).toBe(false)
    expect(isForbiddenCrossSiteMutation('POST', 'same-site')).toBe(false)
    expect(isForbiddenCrossSiteMutation('POST', 'none')).toBe(false)
    expect(isForbiddenCrossSiteMutation('POST', null)).toBe(false)
  })

  it('never blocks non-mutating methods (keeps cross-site GET navigations working)', () => {
    expect(isForbiddenCrossSiteMutation('GET', 'cross-site')).toBe(false)
    expect(isForbiddenCrossSiteMutation('HEAD', 'cross-site')).toBe(false)
    expect(isForbiddenCrossSiteMutation('OPTIONS', 'cross-site')).toBe(false)
  })
})

function request(path: string, method: string, secFetchSite?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (secFetchSite) headers['sec-fetch-site'] = secFetchSite
  return new NextRequest(`http://localhost${path}`, { method, headers })
}

describe('middleware Sec-Fetch enforcement', () => {
  it('rejects a cross-site POST to a payment endpoint with 403', async () => {
    const res = await middleware(request('/api/billing/cancel', 'POST', 'cross-site'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('CROSS_SITE_FORBIDDEN')
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })

  it('rejects a cross-site POST to a cancellation endpoint with 403', async () => {
    const res = await middleware(request('/api/bookings/abc-123/cancel', 'POST', 'cross-site'))
    expect(res.status).toBe(403)
  })

  it('allows a same-origin POST to a payment endpoint', async () => {
    const res = await middleware(request('/api/billing/cancel', 'POST', 'same-origin'))
    expect(res.status).not.toBe(403)
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })

  it('allows a POST with no Sec-Fetch header (legacy / server-to-server)', async () => {
    const res = await middleware(request('/api/billing/cancel', 'POST'))
    expect(res.status).not.toBe(403)
  })

  it('does not block the MercadoPago webhook (cross-site POST is legitimate there)', async () => {
    const res = await middleware(request('/api/webhooks/mercadopago', 'POST', 'cross-site'))
    expect(res.status).not.toBe(403)
  })
})
