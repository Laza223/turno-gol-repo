import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

const h = vi.hoisted(() => ({
  requireAdminStaffAction: vi.fn(),
  adminRateLimited: vi.fn(),
  ensureReferralCode: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => h.revalidatePath(p) }))
vi.mock('@/modules/staff/guards', () => ({
  requireAdminStaffAction: () => h.requireAdminStaffAction(),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({
  adminRateLimited: (id: string) => h.adminRateLimited(id),
}))
vi.mock('@/modules/referrals/referral.service', () => ({
  ensureReferralCode: (id: string) => h.ensureReferralCode(id),
}))

async function load() {
  return import('@/app/(admin)/settings/invitar/actions')
}

beforeEach(() => {
  vi.clearAllMocks()
  h.requireAdminStaffAction.mockResolvedValue({ ok: true, tenant: { id: TENANT_ID } })
  h.adminRateLimited.mockResolvedValue(null)
  h.ensureReferralCode.mockResolvedValue('AH2K9MZP')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('generateReferralLinkAction', () => {
  it('ok: genera el código del tenant y revalida el panel y Hoy', async () => {
    const { generateReferralLinkAction } = await load()

    expect(await generateReferralLinkAction()).toEqual({ success: true })
    expect(h.ensureReferralCode).toHaveBeenCalledWith(TENANT_ID)
    expect(h.revalidatePath).toHaveBeenCalledWith('/settings/invitar')
    expect(h.revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('el guard falla → error, sin generar', async () => {
    h.requireAdminStaffAction.mockResolvedValue({ ok: false, error: 'No autorizado.' })
    const { generateReferralLinkAction } = await load()

    expect(await generateReferralLinkAction()).toEqual({ success: false, error: 'No autorizado.' })
    expect(h.ensureReferralCode).not.toHaveBeenCalled()
  })

  it('rate limit → error, sin generar', async () => {
    h.adminRateLimited.mockResolvedValue('Demasiados intentos.')
    const { generateReferralLinkAction } = await load()

    expect(await generateReferralLinkAction()).toEqual({
      success: false,
      error: 'Demasiados intentos.',
    })
    expect(h.ensureReferralCode).not.toHaveBeenCalled()
  })
})
