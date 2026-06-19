import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IMPERSONATION_COOKIE_NAME,
  verifyImpersonationCookie,
} from '@/modules/auth/impersonation'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const SYSTEM_ADMIN_ID = '22222222-2222-4222-8222-222222222222'

const h = vi.hoisted(() => ({
  requireSystemAdminAction: vi.fn(),
  getTenantSummary: vi.fn(),
  getFirstActiveAdminStaffUserId: vi.fn(),
  insertAuditLog: vi.fn(),
  withTenantContext: vi.fn(),
  getImpersonationSession: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}))

class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT:${url}`)
  }
}

// Neutralizar el grafo de imports pesado de la action (billing/MP/DB).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () => ({ set: h.cookieSet, delete: h.cookieDelete, get: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectError(url)
  },
}))
vi.mock('@/modules/auth/system-admin.guards', () => ({
  requireSystemAdminAction: () => h.requireSystemAdminAction(),
}))
vi.mock('@/modules/auth/impersonation.server', () => ({
  getImpersonationSession: () => h.getImpersonationSession(),
}))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: (id: string, fn: (tx: unknown) => unknown) => {
    h.withTenantContext(id)
    return fn({})
  },
}))
vi.mock('@/shared/db/audit', () => ({
  insertAuditLog: (...args: unknown[]) => h.insertAuditLog(...args),
}))
vi.mock('@/modules/billing/billing.gateway', () => ({ getBillingGateway: vi.fn() }))
vi.mock('@/modules/super-admin/support.service', () => ({
  cancelSubscriptionForSupport: vi.fn(),
  changePlanForSupport: vi.fn(),
  extendTrial: vi.fn(),
  forceTenantStatus: vi.fn(),
  reactivateTenant: vi.fn(),
  updateTenantSettingsForSupport: vi.fn(),
  PlanAlreadyAssignedError: class extends Error {},
  TenantNotFoundError: class extends Error {},
  TrialNotActiveError: class extends Error {},
}))
vi.mock('@/modules/super-admin/tenants.service', () => ({
  getTenantSummary: (id: string) => h.getTenantSummary(id),
}))
vi.mock('@/modules/staff/staff.service', () => ({
  getFirstActiveAdminStaffUserId: (id: string) => h.getFirstActiveAdminStaffUserId(id),
}))

async function loadActions() {
  return import('@/app/(super-admin)/super-admin/tenants/[id]/actions')
}

beforeEach(() => {
  process.env.IMPERSONATION_COOKIE_SECRET = 'test-secret-at-least-16-chars-long'
  // Por defecto el tenant tiene un admin para delegar (proxy de FKs).
  h.getFirstActiveAdminStaffUserId.mockResolvedValue(
    '44444444-4444-4444-8444-444444444444',
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('startImpersonationAction', () => {
  it('setea la cookie firmada y redirige a /dashboard', async () => {
    h.requireSystemAdminAction.mockResolvedValue({
      ok: true,
      admin: { id: SYSTEM_ADMIN_ID, email: 'owner@turnogol.app' },
    })
    h.getTenantSummary.mockResolvedValue({ name: 'Complejo X' })
    h.insertAuditLog.mockResolvedValue(undefined)

    const { startImpersonationAction } = await loadActions()

    await expect(startImpersonationAction(TENANT_ID)).rejects.toMatchObject({
      url: '/dashboard',
    })

    expect(h.cookieSet).toHaveBeenCalledTimes(1)
    const arg = h.cookieSet.mock.calls[0][0]
    expect(arg.name).toBe(IMPERSONATION_COOKIE_NAME)
    expect(arg.httpOnly).toBe(true)
    expect(arg.sameSite).toBe('lax')
    // El valor seteado es una cookie verificable con el payload correcto.
    const payload = verifyImpersonationCookie(arg.value)
    expect(payload).toMatchObject({ tenantId: TENANT_ID, systemAdminId: SYSTEM_ADMIN_ID })

    // Audita started antes de redirigir.
    expect(h.insertAuditLog).toHaveBeenCalledTimes(1)
    expect(h.insertAuditLog.mock.calls[0][1]).toMatchObject({
      action: 'support.impersonation.started',
      actorType: 'system',
      actorId: SYSTEM_ADMIN_ID,
    })
  })

  it('rechaza si el guard falla — no setea cookie', async () => {
    h.requireSystemAdminAction.mockResolvedValue({ ok: false, error: 'No autorizado.' })
    const { startImpersonationAction } = await loadActions()

    expect(await startImpersonationAction(TENANT_ID)).toEqual({
      success: false,
      error: 'No autorizado.',
    })
    expect(h.cookieSet).not.toHaveBeenCalled()
  })

  it('rechaza tenant inexistente — no setea cookie', async () => {
    h.requireSystemAdminAction.mockResolvedValue({
      ok: true,
      admin: { id: SYSTEM_ADMIN_ID, email: 'owner@turnogol.app' },
    })
    h.getTenantSummary.mockResolvedValue(null)
    const { startImpersonationAction } = await loadActions()

    expect(await startImpersonationAction(TENANT_ID)).toEqual({
      success: false,
      error: 'Complejo no encontrado.',
    })
    expect(h.cookieSet).not.toHaveBeenCalled()
  })

  it('rechaza tenant sin admin activo para proxy — no setea cookie', async () => {
    h.requireSystemAdminAction.mockResolvedValue({
      ok: true,
      admin: { id: SYSTEM_ADMIN_ID, email: 'owner@turnogol.app' },
    })
    h.getTenantSummary.mockResolvedValue({ name: 'Complejo X' })
    h.getFirstActiveAdminStaffUserId.mockResolvedValue(null)
    const { startImpersonationAction } = await loadActions()

    expect(await startImpersonationAction(TENANT_ID)).toEqual({
      success: false,
      error: 'El complejo no tiene un administrador activo: no se puede impersonar.',
    })
    expect(h.cookieSet).not.toHaveBeenCalled()
  })

  it('rechaza tenantId no-UUID', async () => {
    h.requireSystemAdminAction.mockResolvedValue({
      ok: true,
      admin: { id: SYSTEM_ADMIN_ID, email: 'owner@turnogol.app' },
    })
    const { startImpersonationAction } = await loadActions()

    expect(await startImpersonationAction('nope')).toEqual({
      success: false,
      error: 'Tenant inválido.',
    })
    expect(h.cookieSet).not.toHaveBeenCalled()
  })
})

describe('stopImpersonationAction', () => {
  it('borra la cookie, audita ended y redirige al detalle del tenant', async () => {
    h.getImpersonationSession.mockResolvedValue({
      systemAdminId: SYSTEM_ADMIN_ID,
      tenantId: TENANT_ID,
    })
    h.insertAuditLog.mockResolvedValue(undefined)

    const { stopImpersonationAction } = await loadActions()

    await expect(stopImpersonationAction()).rejects.toMatchObject({
      url: `/super-admin/tenants/${TENANT_ID}`,
    })

    expect(h.cookieDelete).toHaveBeenCalledWith(IMPERSONATION_COOKIE_NAME)
    expect(h.insertAuditLog.mock.calls[0][1]).toMatchObject({
      action: 'support.impersonation.ended',
      actorType: 'system',
      actorId: SYSTEM_ADMIN_ID,
    })
  })

  it('sin sesión: borra cookie igual y vuelve a /super-admin (no audita)', async () => {
    h.getImpersonationSession.mockResolvedValue(null)
    const { stopImpersonationAction } = await loadActions()

    await expect(stopImpersonationAction()).rejects.toMatchObject({
      url: '/super-admin',
    })
    expect(h.cookieDelete).toHaveBeenCalledWith(IMPERSONATION_COOKIE_NAME)
    expect(h.insertAuditLog).not.toHaveBeenCalled()
  })
})
