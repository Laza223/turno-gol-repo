/**
 * Fin del freemium (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md): un complejo en
 * `trial_expired` (o su alias `free`) pasa los GET de un route handler del panel, y los métodos
 * que escriben solo si la ruta pide `allowExpired` (operar lo que ya existe: el push del admin).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({
  extractAuthUser: vi.fn(),
  getStaffRole: vi.fn(),
  withTenantContext: vi.fn(),
  status: { current: 'trial_expired' },
}))

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: h.extractAuthUser,
  tagSession: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: h.getStaffRole }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  getSql: () => () => Promise.resolve([{ status: h.status.current }]),
  withTenantContext: h.withTenantContext,
}))

import { withTenant } from '@/server/middleware/with-tenant'

function req(method: string): NextRequest {
  return new NextRequest('https://turnogol.app/api/admin/push/subscribe', { method })
}

const ok = async () => NextResponse.json({ ok: true })

beforeEach(() => {
  vi.clearAllMocks()
  h.extractAuthUser.mockResolvedValue({
    type: 'staff',
    id: 'auth-1',
    email: 'admin@test.local',
    staffUserId: 'staff-1',
    tenantId: 'tenant-1',
    role: 'admin',
  })
  h.getStaffRole.mockResolvedValue('admin')
  h.withTenantContext.mockImplementation(async (_id: string, cb: (tx: unknown) => unknown) =>
    cb({}),
  )
})

describe.each(['trial_expired', 'free'])('withTenant con el complejo en %s', (status) => {
  beforeEach(() => {
    h.status.current = status
  })

  it('un GET pasa sin opt-in (las pantallas se ven)', async () => {
    expect((await withTenant(ok)(req('GET'))).status).toBe(200)
  })

  it('un POST sin allowExpired se rechaza con PLAN_REQUIRED', async () => {
    const res = await withTenant(ok)(req('POST'))
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('PLAN_REQUIRED')
    expect(h.withTenantContext).not.toHaveBeenCalled()
  })

  it('un POST con allowExpired pasa, también para el encargado', async () => {
    const handler = withTenant(ok, { allowExpired: true })
    expect((await handler(req('POST'))).status).toBe(200)
    h.getStaffRole.mockResolvedValue('manager')
    expect((await handler(req('DELETE'))).status).toBe(200)
  })
})

describe('withTenant con el plan activo', () => {
  it('no cambia: un POST pasa sin allowExpired', async () => {
    h.status.current = 'active'
    expect((await withTenant(ok)(req('POST'))).status).toBe(200)
  })
})
