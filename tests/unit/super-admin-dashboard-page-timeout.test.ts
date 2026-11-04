import { afterEach, describe, expect, it, vi } from 'vitest'

// Red de seguridad de /super-admin (Pulso): si una lectura no vuelve, la página
// NO se cae ni cuelga hasta los 300 s de Vercel. Cada sección lee dentro de su
// propio Suspense con tope (~12 s) y, si vence, dibuja "No se pudo leer a
// tiempo" en lugar de tirar la página entera (TimeoutError de prod, 2026-10-16).

const h = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
  getPlatformActivity: vi.fn(),
  listReferralRewardsForReview: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/modules/super-admin/dashboard.service', () => ({
  getDashboardData: h.getDashboardData,
}))
vi.mock('@/modules/super-admin/activity.service', () => ({
  getPlatformActivity: h.getPlatformActivity,
  isActivityWindow: (v: string | undefined) => v === 'hoy' || v === '7d' || v === '30d',
}))
vi.mock('@/modules/referrals/referral-reward.service', () => ({
  listReferralRewardsForReview: h.listReferralRewardsForReview,
}))
// Las actions de los premios entran por prop; su grafo (gateway de MP) no hace falta acá.
vi.mock('@/app/(super-admin)/super-admin/actions', () => ({
  approveReferralRewardAction: vi.fn(),
  markReferralRewardAppliedAction: vi.fn(),
  rejectReferralRewardAction: vi.fn(),
}))
vi.mock('@/modules/auth/system-admin.guards', () => ({
  requireSystemAdmin: vi.fn().mockResolvedValue({ admin: { id: 'sa-1' } }),
}))
vi.mock('@/shared/lib/logger', () => ({ logger: { error: h.logError } }))

import SuperAdminPulsoPage from '@/app/(super-admin)/super-admin/page'

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('SuperAdminPulsoPage — tope de tiempo por sección', () => {
  it('devuelve la página sin esperar las lecturas y loguea (no rechaza) cuando vencen', async () => {
    vi.useFakeTimers()
    h.getDashboardData.mockReturnValue(new Promise<never>(() => {}))
    h.getPlatformActivity.mockReturnValue(new Promise<never>(() => {}))
    h.listReferralRewardsForReview.mockReturnValue(new Promise<never>(() => {}))

    // No espera a las lecturas: resuelve de inmediato con el árbol.
    const tree = await SuperAdminPulsoPage({ searchParams: Promise.resolve({}) })
    expect(tree).toBeTruthy()

    // Al vencer el tope, cada sección loguea y degrada: ningún rechazo sin atrapar.
    await vi.advanceTimersByTimeAsync(12_100)
    expect(h.logError).toHaveBeenCalledTimes(3)
  })
})
