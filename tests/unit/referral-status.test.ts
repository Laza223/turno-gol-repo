import { describe, expect, it } from 'vitest'
import { countReferralMonths, describeReferralStatus } from '@/modules/referrals/referral-status'
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

describe('countReferralMonths', () => {
  it('cuenta earned, manual_pending y applied; no cuenta null, rejected ni over_cap', () => {
    const referrals = [null, 'earned', 'manual_pending', 'applied', 'rejected', 'over_cap'].map(
      (rewardStatus) => ({ rewardStatus }),
    )
    expect(countReferralMonths(referrals)).toBe(3)
  })

  it('lista vacía → 0', () => {
    expect(countReferralMonths([])).toBe(0)
  })
})
