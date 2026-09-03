import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Hallazgo #5 (campaña de mutación, docs/qa/TEST_AUDIT.md): oauth-start firma
// el `state` anti-CSRF con `process.env.MP_CLIENT_SECRET ?? ''`. Si la
// variable falta, firma igual con clave vacía — un valor que cualquiera puede
// reproducir — en vez de romper el flujo. El fix es fallar CERRADO: sin la
// variable, no se firma nada.

vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))

import { GET as oauthStart } from '@/app/api/mp/oauth-start/route'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'

const TENANT = 'tenant-xyz-abc'
const APP_URL = 'https://app.test.local'
const ADMIN_USER = {
  type: 'staff' as const,
  id: 'u1',
  email: 'admin@test.local',
  staffUserId: 'staff-1',
  tenantId: TENANT,
  role: 'admin' as const,
}

beforeEach(() => {
  process.env.MP_CLIENT_ID = 'test-client-id'
  process.env.MP_CLIENT_SECRET = 'test-mp-client-secret-1234567890'
  process.env.NEXT_PUBLIC_APP_URL = APP_URL
  vi.mocked(extractAuthUser)
    .mockReset()
    .mockResolvedValue(ADMIN_USER as never)
  vi.mocked(getStaffTenant)
    .mockReset()
    .mockResolvedValue({ id: TENANT } as never)
  vi.mocked(getStaffRole).mockReset().mockResolvedValue('admin')
})

describe('MP OAuth start — MP_CLIENT_SECRET requerido (hallazgo #5)', () => {
  it('MP_CLIENT_SECRET ausente → falla CERRADO (mp_config_missing), nunca firma con clave vacía', async () => {
    delete process.env.MP_CLIENT_SECRET
    const req = new NextRequest(`${APP_URL}/api/mp/oauth-start`)

    const res = await oauthStart(req)

    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('location')).toMatch(/mp_config_missing/)
    // Nunca debe llegar a construir la URL de autorización de MP con un state firmado.
    expect(res.headers.get('location')).not.toMatch(/auth\.mercadopago/)
  })

  it('con MP_CLIENT_SECRET presente, sigue redirigiendo a MercadoPago con state firmado', async () => {
    const req = new NextRequest(`${APP_URL}/api/mp/oauth-start`)
    const res = await oauthStart(req)
    expect(res.headers.get('location')).toMatch(
      /^https:\/\/auth\.mercadopago\.com\.ar\/authorization/,
    )
  })
})
