import { beforeEach, describe, expect, it, vi } from 'vitest'

// B3: botones "Premios de referidos" del Pulso. Las actions solo traducen el
// resultado del service (que es el que hace el CAS); acá se prueba el guard,
// la validación del id y los mensajes. La regla de automático vs. manual se
// prueba en la función pura `decideRewardApplication`.

const REFERRED_ID = '11111111-1111-4111-8111-111111111111'
const REFERRER_ID = '33333333-3333-4333-8333-333333333333'
const SYSTEM_ADMIN_ID = '22222222-2222-4222-8222-222222222222'

const h = vi.hoisted(() => ({
  requireSystemAdminAction: vi.fn(),
  approveReferralReward: vi.fn(),
  markReferralRewardApplied: vi.fn(),
  rejectReferralReward: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => h.revalidatePath(p) }))
vi.mock('@/modules/auth/system-admin.guards', () => ({
  requireSystemAdminAction: () => h.requireSystemAdminAction(),
}))
vi.mock('@/modules/billing/billing.gateway', () => ({ getBillingGateway: () => 'gateway' }))
vi.mock('@/modules/referrals/referral-reward.service', () => ({
  approveReferralReward: (...args: unknown[]) => h.approveReferralReward(...args),
  markReferralRewardApplied: (...args: unknown[]) => h.markReferralRewardApplied(...args),
  rejectReferralReward: (...args: unknown[]) => h.rejectReferralReward(...args),
}))

async function loadActions() {
  return import('@/app/(super-admin)/super-admin/actions')
}

beforeEach(() => {
  vi.clearAllMocks()
  h.requireSystemAdminAction.mockResolvedValue({
    ok: true,
    admin: { id: SYSTEM_ADMIN_ID, email: 'owner@turnogol.app' },
  })
})

describe('approveReferralRewardAction', () => {
  it('prueba extendida → mensaje de 30 días y revalida Pulso + los dos complejos', async () => {
    h.approveReferralReward.mockResolvedValue({
      ok: true,
      applied: 'trial_extended',
      trialEndsAt: new Date(),
    })
    const { approveReferralRewardAction } = await loadActions()

    const res = await approveReferralRewardAction(REFERRED_ID, REFERRER_ID)

    expect(res).toEqual({ success: true, message: 'Listo: su prueba se extendió 30 días.' })
    expect(h.approveReferralReward).toHaveBeenCalledWith(REFERRED_ID, SYSTEM_ADMIN_ID, 'gateway')
    expect(h.revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      '/super-admin',
      `/super-admin/tenants/${REFERRED_ID}`,
      `/super-admin/tenants/${REFERRER_ID}`,
    ])
  })

  it('pendiente manual → pide devolver el próximo cobro', async () => {
    h.approveReferralReward.mockResolvedValue({ ok: true, applied: 'manual_pending' })
    const { approveReferralRewardAction } = await loadActions()

    const res = await approveReferralRewardAction(REFERRED_ID, REFERRER_ID)

    expect(res.success).toBe(true)
    if (res.success) expect(res.message).toMatch(/devolverle su próximo cobro/)
  })

  it('doble click (ya procesado) → error, sin revalidar', async () => {
    h.approveReferralReward.mockResolvedValue({ ok: false, reason: 'already_processed' })
    const { approveReferralRewardAction } = await loadActions()

    const res = await approveReferralRewardAction(REFERRED_ID, REFERRER_ID)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/ya se había procesado/)
    expect(h.revalidatePath).not.toHaveBeenCalled()
  })

  it('referidor sin cuenta vigente → error explícito', async () => {
    h.approveReferralReward.mockResolvedValue({ ok: false, reason: 'referrer_inactive' })
    const { approveReferralRewardAction } = await loadActions()

    const res = await approveReferralRewardAction(REFERRED_ID, REFERRER_ID)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/no tiene la cuenta vigente/)
  })

  it('guard rechaza → no llama al service', async () => {
    h.requireSystemAdminAction.mockResolvedValue({ ok: false, error: 'No autorizado.' })
    const { approveReferralRewardAction } = await loadActions()

    const res = await approveReferralRewardAction(REFERRED_ID, REFERRER_ID)

    expect(res).toEqual({ success: false, error: 'No autorizado.' })
    expect(h.approveReferralReward).not.toHaveBeenCalled()
  })

  it('id que no es uuid → no llama al service', async () => {
    const { approveReferralRewardAction } = await loadActions()

    const res = await approveReferralRewardAction('no-es-un-uuid', REFERRER_ID)

    expect(res.success).toBe(false)
    expect(h.approveReferralReward).not.toHaveBeenCalled()
  })
})

describe('markReferralRewardAppliedAction', () => {
  it('happy path → acreditado', async () => {
    h.markReferralRewardApplied.mockResolvedValue({ ok: true })
    const { markReferralRewardAppliedAction } = await loadActions()

    const res = await markReferralRewardAppliedAction(REFERRED_ID, REFERRER_ID)

    expect(res).toEqual({ success: true, message: 'Premio marcado como acreditado.' })
    expect(h.markReferralRewardApplied).toHaveBeenCalledWith(REFERRED_ID, SYSTEM_ADMIN_ID)
  })

  it('ya procesado → error', async () => {
    h.markReferralRewardApplied.mockResolvedValue({ ok: false, reason: 'already_processed' })
    const { markReferralRewardAppliedAction } = await loadActions()

    const res = await markReferralRewardAppliedAction(REFERRED_ID, null)

    expect(res.success).toBe(false)
  })

  it('guard rechaza → no llama al service', async () => {
    h.requireSystemAdminAction.mockResolvedValue({ ok: false, error: 'No autorizado.' })
    const { markReferralRewardAppliedAction } = await loadActions()

    await markReferralRewardAppliedAction(REFERRED_ID, REFERRER_ID)

    expect(h.markReferralRewardApplied).not.toHaveBeenCalled()
  })
})

describe('rejectReferralRewardAction', () => {
  it('happy path → rechazado; sin referidor solo revalida Pulso y el referido', async () => {
    h.rejectReferralReward.mockResolvedValue({ ok: true })
    const { rejectReferralRewardAction } = await loadActions()

    const res = await rejectReferralRewardAction(REFERRED_ID, null)

    expect(res).toEqual({ success: true, message: 'Premio rechazado.' })
    expect(h.revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      '/super-admin',
      `/super-admin/tenants/${REFERRED_ID}`,
    ])
  })

  it('no encontrado → error', async () => {
    h.rejectReferralReward.mockResolvedValue({ ok: false, reason: 'not_found' })
    const { rejectReferralRewardAction } = await loadActions()

    const res = await rejectReferralRewardAction(REFERRED_ID, null)

    expect(res).toEqual({ success: false, error: 'No encontramos ese complejo.' })
  })

  it('guard rechaza → no llama al service', async () => {
    h.requireSystemAdminAction.mockResolvedValue({ ok: false, error: 'No autorizado.' })
    const { rejectReferralRewardAction } = await loadActions()

    await rejectReferralRewardAction(REFERRED_ID, null)

    expect(h.rejectReferralReward).not.toHaveBeenCalled()
  })
})
