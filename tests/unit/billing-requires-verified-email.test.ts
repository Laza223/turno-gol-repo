import { describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// Los tres POST que cobran o suben canchas facturadas cortan antes de tocar
// billing si el mail del dueño no está verificado.
const h = vi.hoisted(() => ({
  verify: vi.fn(),
  subscribe: vi.fn(),
  reactivate: vi.fn(),
  changeBilledCourts: vi.fn(),
}))

type Handler = (req: NextRequest, user: unknown, tx: unknown) => Promise<Response>
vi.mock('@/server/middleware/with-tenant', () => ({
  withTenant: (fn: Handler) => (req: NextRequest) =>
    fn(req, { tenantId: 't1', staffUserId: 's1' }, {}),
  withBillingTenant: (fn: Handler) => (req: NextRequest) =>
    fn(req, { tenantId: 't1', staffUserId: 's1' }, {}),
}))
vi.mock('@/shared/rate-limit/route-guard', () => ({ guard: async () => null }))
vi.mock('@/modules/auth/email-verification.service', () => ({
  requireVerifiedOwnerEmail: h.verify,
}))
vi.mock('@/modules/billing/billing.service', () => ({
  subscribe: h.subscribe,
  reactivate: h.reactivate,
  changeBilledCourts: h.changeBilledCourts,
}))
vi.mock('@/modules/billing/billing.gateway', () => ({ getBillingGateway: () => ({}) }))
vi.mock('@/shared/feature-flags', () => ({ isFeatureEnabled: async () => true }))

import { POST as subscribePost } from '@/app/api/billing/subscribe/route'
import { POST as reactivatePost } from '@/app/api/billing/reactivate/route'
import { POST as canchasPost } from '@/app/api/billing/canchas/route'

const req = { json: async () => ({}) } as unknown as NextRequest

describe.each([
  ['subscribe', subscribePost, h.subscribe],
  ['reactivate', reactivatePost, h.reactivate],
  ['canchas', canchasPost, h.changeBilledCourts],
] as const)('POST /api/billing/%s con el mail sin verificar', (_name, post, service) => {
  it('responde 403 EMAIL_NOT_VERIFIED y no llama al service', async () => {
    h.verify.mockResolvedValue({ ok: false, error: 'Confirmá tu mail para activar el plan.' })

    const res = await post(req)
    const body = (await res.json()) as { error: { code: string; message: string } }

    expect(res.status).toBe(403)
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED')
    expect(body.error.message).toBe('Confirmá tu mail para activar el plan.')
    expect(service).not.toHaveBeenCalled()
  })
})
