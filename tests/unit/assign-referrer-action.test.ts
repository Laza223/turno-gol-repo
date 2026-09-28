import { beforeEach, describe, expect, it, vi } from 'vitest'

// B2: "Asignar referidor" del panel SuperAdmin. Mismo patrón de neutralización
// del grafo de imports pesado que impersonation-actions.test.ts (mismo archivo
// de actions).

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const SYSTEM_ADMIN_ID = '22222222-2222-4222-8222-222222222222'

const h = vi.hoisted(() => ({
  requireSystemAdminAction: vi.fn(),
  getTenantSummary: vi.fn(),
  assignReferrer: vi.fn(),
  insertAuditLog: vi.fn(),
  withTenantContext: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/modules/auth/system-admin.guards', () => ({
  requireSystemAdminAction: () => h.requireSystemAdminAction(),
}))
vi.mock('@/modules/auth/impersonation.server', () => ({ getImpersonationSession: vi.fn() }))
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
  changeBilledCourtsForSupport: vi.fn(),
  extendTrial: vi.fn(),
  forceTenantStatus: vi.fn(),
  reactivateTenant: vi.fn(),
  updateTenantMarketplaceVisibility: vi.fn(),
  updateTenantSettingsForSupport: vi.fn(),
  PlanAlreadyAssignedError: class extends Error {},
  TenantNotFoundError: class extends Error {},
  TrialNotActiveError: class extends Error {},
}))
vi.mock('@/modules/super-admin/tenants.service', () => ({
  getTenantSummary: (id: string) => h.getTenantSummary(id),
}))
vi.mock('@/modules/staff/staff.service', () => ({ getFirstActiveAdminStaffUserId: vi.fn() }))
vi.mock('@/modules/referrals/referral.service', () => ({
  assignReferrer: (...args: unknown[]) => h.assignReferrer(...args),
  ensureReferralCode: vi.fn(),
}))

async function loadActions() {
  return import('@/app/(super-admin)/super-admin/tenants/[id]/actions')
}

beforeEach(() => {
  vi.clearAllMocks()
  h.requireSystemAdminAction.mockResolvedValue({
    ok: true,
    admin: { id: SYSTEM_ADMIN_ID, email: 'owner@turnogol.app' },
  })
  h.getTenantSummary.mockResolvedValue({ name: 'Complejo X' })
  h.insertAuditLog.mockResolvedValue(undefined)
})

describe('assignReferrerAction', () => {
  it('happy path: asigna y audita support.tenant.referrer_assigned', async () => {
    h.assignReferrer.mockResolvedValue({ ok: true, referrerName: 'Canchas del Sur' })
    const { assignReferrerAction } = await loadActions()

    const res = await assignReferrerAction({ tenantId: TENANT_ID, code: 'AH2K9MZP' })

    expect(res).toEqual({ success: true, referrerName: 'Canchas del Sur' })
    expect(h.assignReferrer).toHaveBeenCalledWith(TENANT_ID, 'AH2K9MZP')
    expect(h.insertAuditLog).toHaveBeenCalledTimes(1)
    expect(h.insertAuditLog.mock.calls[0][1]).toMatchObject({
      action: 'support.tenant.referrer_assigned',
      actorType: 'system',
      actorId: SYSTEM_ADMIN_ID,
      tenantId: TENANT_ID,
    })
  })

  it('ya tiene referidor (u otra condición de elegibilidad) → error, sin auditar', async () => {
    h.assignReferrer.mockResolvedValue({ ok: false, reason: 'not_eligible' })
    const { assignReferrerAction } = await loadActions()

    const res = await assignReferrerAction({ tenantId: TENANT_ID, code: 'AH2K9MZP' })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/ya tiene referidor/)
    expect(h.insertAuditLog).not.toHaveBeenCalled()
  })

  it('self (el complejo referido por sí mismo) → error', async () => {
    h.assignReferrer.mockResolvedValue({ ok: false, reason: 'self' })
    const { assignReferrerAction } = await loadActions()

    const res = await assignReferrerAction({ tenantId: TENANT_ID, code: 'AH2K9MZP' })

    expect(res).toEqual({
      success: false,
      error: 'Un complejo no puede ser su propio referidor.',
    })
  })

  it('código inexistente → error', async () => {
    h.assignReferrer.mockResolvedValue({ ok: false, reason: 'invalid_code' })
    const { assignReferrerAction } = await loadActions()

    const res = await assignReferrerAction({ tenantId: TENANT_ID, code: 'ZZZZZZZZ' })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/no es válido/)
  })

  it('rechaza si el guard de super-admin falla — no llama a assignReferrer', async () => {
    h.requireSystemAdminAction.mockResolvedValue({ ok: false, error: 'No autorizado.' })
    const { assignReferrerAction } = await loadActions()

    const res = await assignReferrerAction({ tenantId: TENANT_ID, code: 'AH2K9MZP' })

    expect(res).toEqual({ success: false, error: 'No autorizado.' })
    expect(h.assignReferrer).not.toHaveBeenCalled()
  })

  it('tenant inexistente → error, sin llamar a assignReferrer', async () => {
    h.getTenantSummary.mockResolvedValue(null)
    const { assignReferrerAction } = await loadActions()

    const res = await assignReferrerAction({ tenantId: TENANT_ID, code: 'AH2K9MZP' })

    expect(res).toEqual({ success: false, error: 'Complejo no encontrado.' })
    expect(h.assignReferrer).not.toHaveBeenCalled()
  })

  it('input inválido (sin código) → error de validación', async () => {
    const { assignReferrerAction } = await loadActions()

    const res = await assignReferrerAction({ tenantId: TENANT_ID, code: '' })

    expect(res.success).toBe(false)
    expect(h.assignReferrer).not.toHaveBeenCalled()
  })
})
