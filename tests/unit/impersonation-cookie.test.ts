import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildImpersonationCookie,
  IMPERSONATION_TTL_MS,
  verifyImpersonationCookie,
} from '@/shared/security/impersonation-cookie'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const SYSTEM_ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const NOW = 1_750_000_000_000

beforeEach(() => {
  process.env.IMPERSONATION_COOKIE_SECRET = 'test-secret-at-least-16-chars-long'
})

describe('buildImpersonationCookie / verifyImpersonationCookie', () => {
  it('roundtrip: una cookie recién firmada verifica y trae el payload', () => {
    const cookie = buildImpersonationCookie(
      { tenantId: TENANT_ID, systemAdminId: SYSTEM_ADMIN_ID },
      NOW,
    )
    const payload = verifyImpersonationCookie(cookie, NOW + 1000)
    expect(payload).toEqual({
      tenantId: TENANT_ID,
      systemAdminId: SYSTEM_ADMIN_ID,
      exp: NOW + IMPERSONATION_TTL_MS,
    })
  })

  it('rechaza una cookie expirada (now ≥ exp)', () => {
    const cookie = buildImpersonationCookie(
      { tenantId: TENANT_ID, systemAdminId: SYSTEM_ADMIN_ID },
      NOW,
    )
    expect(verifyImpersonationCookie(cookie, NOW + IMPERSONATION_TTL_MS)).toBeNull()
    expect(verifyImpersonationCookie(cookie, NOW + IMPERSONATION_TTL_MS + 1)).toBeNull()
  })

  it('rechaza firma alterada', () => {
    const cookie = buildImpersonationCookie(
      { tenantId: TENANT_ID, systemAdminId: SYSTEM_ADMIN_ID },
      NOW,
    )
    const dot = cookie.indexOf('.')
    const tampered = `${cookie.slice(0, dot + 1)}${cookie
      .slice(dot + 1)
      .split('')
      .reverse()
      .join('')}`
    expect(verifyImpersonationCookie(tampered, NOW + 1000)).toBeNull()
  })

  it('rechaza payload alterado (firma ya no coincide)', () => {
    const cookie = buildImpersonationCookie(
      { tenantId: TENANT_ID, systemAdminId: SYSTEM_ADMIN_ID },
      NOW,
    )
    const dot = cookie.indexOf('.')
    const payload = cookie.slice(0, dot)
    const flipped = `${payload.slice(0, -1)}${payload.at(-1) === 'A' ? 'B' : 'A'}`
    const tampered = `${flipped}${cookie.slice(dot)}`
    expect(verifyImpersonationCookie(tampered, NOW + 1000)).toBeNull()
  })

  it('rechaza formatos basura', () => {
    expect(verifyImpersonationCookie('', NOW)).toBeNull()
    expect(verifyImpersonationCookie('nodot', NOW)).toBeNull()
    expect(verifyImpersonationCookie('.', NOW)).toBeNull()
    expect(verifyImpersonationCookie('.abc', NOW)).toBeNull()
  })

  it('una cookie firmada con OTRO secreto no verifica (anti-forja)', () => {
    process.env.IMPERSONATION_COOKIE_SECRET = 'attacker-secret-also-16-chars-xx'
    const forged = buildImpersonationCookie(
      { tenantId: TENANT_ID, systemAdminId: SYSTEM_ADMIN_ID },
      NOW,
    )
    process.env.IMPERSONATION_COOKIE_SECRET = 'test-secret-at-least-16-chars-long'
    expect(verifyImpersonationCookie(forged, NOW + 1000)).toBeNull()
  })

  it('lanza si falta el secreto', () => {
    delete process.env.IMPERSONATION_COOKIE_SECRET
    expect(() =>
      buildImpersonationCookie({ tenantId: TENANT_ID, systemAdminId: SYSTEM_ADMIN_ID }, NOW),
    ).toThrow(/IMPERSONATION_COOKIE_SECRET/)
  })
})

// ─── impersonation.server: lectura de cookie + sesión ────────────────────────

const cookieStore = { get: vi.fn() }
vi.mock('next/headers', () => ({ cookies: () => cookieStore }))

const extractRealAuthUser = vi.fn()
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractRealAuthUser: () => extractRealAuthUser(),
}))

// F11: getImpersonationSessionFor now also dynamically imports this guard on
// every read (DB row + allowlist re-check) — mocked so these tests exercise
// the cookie/JWT logic alone, without a real DB. Defaults to "still
// authorized" so pre-F11 assertions keep testing what they tested before.
const isSystemAdminActiveAndAllowlisted = vi.fn()
vi.mock('@/modules/auth/system-admin.guards', () => ({
  isSystemAdminActiveAndAllowlisted: (id: string) => isSystemAdminActiveAndAllowlisted(id),
}))

beforeEach(() => {
  isSystemAdminActiveAndAllowlisted.mockResolvedValue(true)
})

afterEach(() => {
  cookieStore.get.mockReset()
  extractRealAuthUser.mockReset()
  isSystemAdminActiveAndAllowlisted.mockReset()
})

describe('getImpersonationSession (impersonation.server)', () => {
  async function load() {
    return import('@/modules/auth/impersonation.server')
  }

  function validCookie() {
    return buildImpersonationCookie(
      { tenantId: TENANT_ID, systemAdminId: SYSTEM_ADMIN_ID },
      Date.now(),
    )
  }

  it('devuelve la sesión cuando el system_admin coincide y la cookie es válida', async () => {
    extractRealAuthUser.mockResolvedValue({
      type: 'system_admin',
      id: 'auth-id',
      email: 'owner@turnogol.app',
      systemAdminId: SYSTEM_ADMIN_ID,
    })
    cookieStore.get.mockReturnValue({ value: validCookie() })

    const { getImpersonationSession } = await load()
    expect(await getImpersonationSession()).toEqual({
      systemAdminId: SYSTEM_ADMIN_ID,
      tenantId: TENANT_ID,
    })
  })

  it('null si el usuario no es system_admin (un staff no puede impersonar)', async () => {
    extractRealAuthUser.mockResolvedValue({
      type: 'staff',
      id: 'x',
      email: 'staff@x.com',
      staffUserId: 'su',
      tenantId: TENANT_ID,
      role: 'admin',
    })
    cookieStore.get.mockReturnValue({ value: validCookie() })

    const { getImpersonationSession } = await load()
    expect(await getImpersonationSession()).toBeNull()
  })

  it('null si la cookie pertenece a OTRO system_admin', async () => {
    extractRealAuthUser.mockResolvedValue({
      type: 'system_admin',
      id: 'auth-id',
      email: 'owner@turnogol.app',
      systemAdminId: '33333333-3333-4333-8333-333333333333',
    })
    cookieStore.get.mockReturnValue({ value: validCookie() })

    const { getImpersonationSession } = await load()
    expect(await getImpersonationSession()).toBeNull()
  })

  it('null si no hay cookie', async () => {
    extractRealAuthUser.mockResolvedValue({
      type: 'system_admin',
      id: 'auth-id',
      email: 'owner@turnogol.app',
      systemAdminId: SYSTEM_ADMIN_ID,
    })
    cookieStore.get.mockReturnValue(undefined)

    const { getImpersonationSession } = await load()
    expect(await getImpersonationSession()).toBeNull()
  })
})
