import { describe, expect, it } from 'vitest'
import { decideRewardApplication } from '@/modules/referrals/referral-reward.service'

// R5 + decisión 2026-10-22 (docs/decisions/2026-10-22-referidos-metodo-manual-premio.md):
// la prueba se extiende sola solo si el referidor está en prueba y no tiene un
// débito que vaya a cobrar. Todo lo demás va al método manual (devolver el cobro).

const SUB = 'preapproval-hash-1'

describe('decideRewardApplication', () => {
  it('en prueba sin débito → extiende la prueba', () => {
    expect(
      decideRewardApplication({
        referrerStatus: 'trialing',
        mpSubscriptionId: null,
        checkedMpSubscriptionId: null,
        checkoutUnpaid: false,
      }),
    ).toBe('extend_trial')
  })

  it('en prueba con checkout pendiente sin pagar (caso El Vagón) → extiende la prueba', () => {
    expect(
      decideRewardApplication({
        referrerStatus: 'trialing',
        mpSubscriptionId: SUB,
        checkedMpSubscriptionId: SUB,
        checkoutUnpaid: true,
      }),
    ).toBe('extend_trial')
  })

  it('en prueba con débito autorizado → manual', () => {
    expect(
      decideRewardApplication({
        referrerStatus: 'trialing',
        mpSubscriptionId: SUB,
        checkedMpSubscriptionId: SUB,
        checkoutUnpaid: false,
      }),
    ).toBe('manual')
  })

  it('el checkout cambió entre la consulta a MP y el lock → manual (no confía en una lectura vieja)', () => {
    expect(
      decideRewardApplication({
        referrerStatus: 'trialing',
        mpSubscriptionId: 'preapproval-hash-2',
        checkedMpSubscriptionId: SUB,
        checkoutUnpaid: true,
      }),
    ).toBe('manual')
  })

  it.each(['active', 'past_due', 'suspended', 'blocked'] as const)(
    '%s (paga o pagó) → manual aunque no tenga débito',
    (status) => {
      expect(
        decideRewardApplication({
          referrerStatus: status,
          mpSubscriptionId: null,
          checkedMpSubscriptionId: null,
          checkoutUnpaid: false,
        }),
      ).toBe('manual')
    },
  )
})
