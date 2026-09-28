import { describe, expect, it } from 'vitest'
import { shouldShowReferralBanner } from '@/lib/dashboard/referral-banner'

/** Instante ART (`America/Argentina/Buenos_Aires`, UTC-3) expresado en UTC. */
function artInstant(iso: string): Date {
  return new Date(iso)
}

describe('shouldShowReferralBanner', () => {
  it('manager: no se muestra aunque tenga código y no esté descartado', () => {
    expect(
      shouldShowReferralBanner({
        role: 'manager',
        referralCode: 'AH2K9MZP',
        dismissedAt: null,
        now: artInstant('2026-10-01T12:00:00.000Z'),
      }),
    ).toBe(false)
  })

  it('admin sin código todavía: no se muestra', () => {
    expect(
      shouldShowReferralBanner({
        role: 'admin',
        referralCode: null,
        dismissedAt: null,
        now: artInstant('2026-10-01T12:00:00.000Z'),
      }),
    ).toBe(false)
  })

  it('admin con código pero descartado: no se muestra', () => {
    expect(
      shouldShowReferralBanner({
        role: 'admin',
        referralCode: 'AH2K9MZP',
        dismissedAt: '2026-09-28T12:00:00.000Z',
        now: artInstant('2026-10-01T12:00:00.000Z'),
      }),
    ).toBe(false)
  })

  it('2026-10-31 23:59 ART (dentro de la promo): sí se muestra', () => {
    // 2026-10-31 23:59 ART = 2026-11-01T02:59:00.000Z (ART = UTC-3).
    expect(
      shouldShowReferralBanner({
        role: 'admin',
        referralCode: 'AH2K9MZP',
        dismissedAt: null,
        now: artInstant('2026-11-01T02:59:00.000Z'),
      }),
    ).toBe(true)
  })

  it('2026-11-01 00:00 ART (ya cerrada la promo): no se muestra', () => {
    // 2026-11-01 00:00 ART = 2026-11-01T03:00:00.000Z.
    expect(
      shouldShowReferralBanner({
        role: 'admin',
        referralCode: 'AH2K9MZP',
        dismissedAt: null,
        now: artInstant('2026-11-01T03:00:00.000Z'),
      }),
    ).toBe(false)
  })

  it('admin con código, sin descartar, dentro de la promo: sí se muestra', () => {
    expect(
      shouldShowReferralBanner({
        role: 'admin',
        referralCode: 'AH2K9MZP',
        dismissedAt: null,
        now: artInstant('2026-10-01T12:00:00.000Z'),
      }),
    ).toBe(true)
  })
})
