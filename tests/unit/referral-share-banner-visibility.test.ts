import { describe, expect, it } from 'vitest'
import { shouldShowReferralBanner } from '@/lib/dashboard/referral-banner'

describe('shouldShowReferralBanner', () => {
  it('manager: no se muestra aunque tenga código y no esté descartado', () => {
    expect(
      shouldShowReferralBanner({
        role: 'manager',
        referralCode: 'AH2K9MZP',
        dismissedAt: null,
      }),
    ).toBe(false)
  })

  it('admin sin código todavía: no se muestra', () => {
    expect(
      shouldShowReferralBanner({
        role: 'admin',
        referralCode: null,
        dismissedAt: null,
      }),
    ).toBe(false)
  })

  it('admin con código pero descartado: no se muestra', () => {
    expect(
      shouldShowReferralBanner({
        role: 'admin',
        referralCode: 'AH2K9MZP',
        dismissedAt: '2026-09-28T12:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('admin con código, sin descartar: sí, en cualquier fecha (el programa es permanente) se muestra', () => {
    expect(
      shouldShowReferralBanner({
        role: 'admin',
        referralCode: 'AH2K9MZP',
        dismissedAt: null,
      }),
    ).toBe(true)
  })
})
