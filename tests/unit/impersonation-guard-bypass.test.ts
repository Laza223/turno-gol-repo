import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildImpersonationCookie } from '@/shared/security/impersonation-cookie'
import type { TenantRow } from '@/modules/tenants/tenant.types'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const SYSTEM_ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ADMIN_ID = '33333333-3333-4333-8333-333333333333'
const PROXY_STAFF_ID = '44444444-4444-4444-8444-444444444444'
const REAL_AUTH_ID = 'auth-user-id'

const cookieStore = { get: vi.fn() }
vi.mock('next/headers', () => ({ cookies: () => cookieStore }))

const h = vi.hoisted(() => ({
  getTenantById: vi.fn(),
  getFirstActiveAdminStaffUserId: vi.fn(),
  isSystemAdminActiveAndAllowlisted: vi.fn(),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getTenantById: (id: string) => h.getTenantById(id),
}))
vi.mock('@/modules/staff/staff.service', () => ({
  getFirstActiveAdminStaffUserId: (id: string) => h.getFirstActiveAdminStaffUserId(id),
}))
// F11: getImpersonationSessionFor now re-checks the DB row + allowlist via a
// dynamic import of system-admin.guards — mocked so these tests exercise the
// cookie/JWT logic without hitting a real DB. Defaults to "still authorized"
// in beforeEach; the F11-specific tests below override it to simulate revocation.
vi.mock('@/modules/auth/system-admin.guards', () => ({
  isSystemAdminActiveAndAllowlisted: (id: string) => h.isSystemAdminActiveAndAllowlisted(id),
}))

const TENANT = {
  id: TENANT_ID,
  name: 'Complejo El Potrero',
  status: 'active',
} as unknown as TenantRow

const SYSTEM_ADMIN_USER = {
  type: 'system_admin' as const,
  id: REAL_AUTH_ID,
  email: 'owner@turnogol.app',
  systemAdminId: SYSTEM_ADMIN_ID,
}

function validCookie(systemAdminId = SYSTEM_ADMIN_ID) {
  return buildImpersonationCookie({ tenantId: TENANT_ID, systemAdminId }, Date.now())
}

async function load() {
  return import('@/modules/auth/impersonation.server')
}

beforeEach(() => {
  process.env.IMPERSONATION_COOKIE_SECRET = 'test-secret-at-least-16-chars-long'
  h.getTenantById.mockResolvedValue(TENANT)
  h.getFirstActiveAdminStaffUserId.mockResolvedValue(PROXY_STAFF_ID)
  h.isSystemAdminActiveAndAllowlisted.mockResolvedValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('resolveImpersonatedStaffContextFor (bypass core)', () => {
  it('system_admin + cookie válida → staff sintético con admin proxy en los FKs', async () => {
    cookieStore.get.mockReturnValue({ value: validCookie() })
    const { resolveImpersonatedStaffContextFor } = await load()

    const ctx = await resolveImpersonatedStaffContextFor(SYSTEM_ADMIN_USER)
    expect(ctx).not.toBeNull()
    expect(ctx!.systemAdminId).toBe(SYSTEM_ADMIN_ID)
    expect(ctx!.proxyStaffUserId).toBe(PROXY_STAFF_ID)
    expect(ctx!.tenant.id).toBe(TENANT_ID)
    expect(ctx!.user).toEqual({
      type: 'staff',
      id: REAL_AUTH_ID, // identidad real del super admin (verdad en audit)
      email: 'owner@turnogol.app',
      staffUserId: PROXY_STAFF_ID, // proxy: satisface los FK a staff_users.id
      tenantId: TENANT_ID,
      role: 'admin',
    })
  })

  it('un staff común NUNCA es impersonado (no bypass)', async () => {
    cookieStore.get.mockReturnValue({ value: validCookie() })
    const { resolveImpersonatedStaffContextFor } = await load()

    const ctx = await resolveImpersonatedStaffContextFor({
      type: 'staff',
      id: 'x',
      email: 'staff@x.com',
      staffUserId: 'su',
      tenantId: TENANT_ID,
      role: 'admin',
    })
    expect(ctx).toBeNull()
  })

  it('un player NUNCA es impersonado', async () => {
    cookieStore.get.mockReturnValue({ value: validCookie() })
    const { resolveImpersonatedStaffContextFor } = await load()
    const ctx = await resolveImpersonatedStaffContextFor({
      type: 'player',
      id: 'p',
      playerId: 'pid',
      email: 'p@x.com',
    })
    expect(ctx).toBeNull()
  })

  it('sin usuario real → null', async () => {
    cookieStore.get.mockReturnValue({ value: validCookie() })
    const { resolveImpersonatedStaffContextFor } = await load()
    expect(await resolveImpersonatedStaffContextFor(null)).toBeNull()
  })

  it('cookie de OTRO system_admin → null', async () => {
    cookieStore.get.mockReturnValue({ value: validCookie(OTHER_ADMIN_ID) })
    const { resolveImpersonatedStaffContextFor } = await load()
    expect(await resolveImpersonatedStaffContextFor(SYSTEM_ADMIN_USER)).toBeNull()
  })

  it('sin cookie → null (system admin normal, sin impersonar)', async () => {
    cookieStore.get.mockReturnValue(undefined)
    const { resolveImpersonatedStaffContextFor } = await load()
    expect(await resolveImpersonatedStaffContextFor(SYSTEM_ADMIN_USER)).toBeNull()
  })

  it('tenant inexistente (borrado) → null (cae al flujo normal)', async () => {
    cookieStore.get.mockReturnValue({ value: validCookie() })
    h.getTenantById.mockResolvedValue(null)
    const { resolveImpersonatedStaffContextFor } = await load()
    expect(await resolveImpersonatedStaffContextFor(SYSTEM_ADMIN_USER)).toBeNull()
  })

  it('tenant sin admin activo → lanza NoActiveAdminToProxyError', async () => {
    cookieStore.get.mockReturnValue({ value: validCookie() })
    h.getFirstActiveAdminStaffUserId.mockResolvedValue(null)
    const { resolveImpersonatedStaffContextFor, NoActiveAdminToProxyError } = await load()

    await expect(resolveImpersonatedStaffContextFor(SYSTEM_ADMIN_USER)).rejects.toBeInstanceOf(
      NoActiveAdminToProxyError,
    )
  })
})

describe('getImpersonationSessionFor', () => {
  it('system_admin + cookie → sesión', async () => {
    cookieStore.get.mockReturnValue({ value: validCookie() })
    const { getImpersonationSessionFor } = await load()
    // async desde Next 16: cookies() devuelve Promise.
    expect(await getImpersonationSessionFor(SYSTEM_ADMIN_USER)).toEqual({
      systemAdminId: SYSTEM_ADMIN_ID,
      tenantId: TENANT_ID,
    })
  })

  it('staff → null', async () => {
    cookieStore.get.mockReturnValue({ value: validCookie() })
    const { getImpersonationSessionFor } = await load()
    expect(
      await getImpersonationSessionFor({
        type: 'staff',
        id: 'x',
        email: 'staff@x.com',
        staffUserId: 'su',
        tenantId: TENANT_ID,
        role: 'admin',
      }),
    ).toBeNull()
  })

  // F11: revoking the system admin (status inactive, or dropped from the
  // allowlist) must kill an already-issued impersonation session immediately,
  // not just once the signed cookie's own TTL expires.
  describe('revocación mid-session (F11)', () => {
    it('system admin desactivado en DB → null aun con cookie firmada válida', async () => {
      cookieStore.get.mockReturnValue({ value: validCookie() })
      h.isSystemAdminActiveAndAllowlisted.mockResolvedValue(false)
      const { getImpersonationSessionFor } = await load()

      expect(await getImpersonationSessionFor(SYSTEM_ADMIN_USER)).toBeNull()
      expect(h.isSystemAdminActiveAndAllowlisted).toHaveBeenCalledWith(SYSTEM_ADMIN_ID)
    })

    it('resolveImpersonatedStaffContextFor también corta al revocar', async () => {
      cookieStore.get.mockReturnValue({ value: validCookie() })
      h.isSystemAdminActiveAndAllowlisted.mockResolvedValue(false)
      const { resolveImpersonatedStaffContextFor } = await load()

      expect(await resolveImpersonatedStaffContextFor(SYSTEM_ADMIN_USER)).toBeNull()
    })
  })
})
