import { describe, expect, it } from 'vitest'
import { describeReferralStatus, isReferrerInactive } from '@/modules/referrals/referral-status'
import { REFERRAL_REWARD_CAP } from '@/shared/constants'

describe('describeReferralStatus', () => {
  it.each([null, 'earned', 'manual_pending', 'applied', 'rejected', 'over_cap'])(
    'tiene copy para %s',
    (status) => {
      const copy = describeReferralStatus(status)
      expect(copy.label).not.toBe('')
      expect(copy.detail).not.toBe('')
    },
  )

  it('null y un estado desconocido se leen como "todavía no pagó"', () => {
    expect(describeReferralStatus(null).detail).toMatch(/no pagó/)
    expect(describeReferralStatus('algo_nuevo')).toEqual(describeReferralStatus(null))
  })

  it('over_cap nombra el tope sin hardcodear el 6', () => {
    expect(describeReferralStatus('over_cap').detail).toContain(String(REFERRAL_REWARD_CAP))
  })
})

describe('isReferrerInactive (sub-regla 3)', () => {
  it.each(['canceled', 'churned', 'deleted'])('%s pierde el premio', (status) => {
    expect(isReferrerInactive(status)).toBe(true)
  })

  it.each(['trialing', 'active', 'past_due', 'suspended', 'blocked', null])(
    '%s sigue vigente',
    (status) => {
      expect(isReferrerInactive(status)).toBe(false)
    },
  )
})
