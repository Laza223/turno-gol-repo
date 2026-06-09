import { describe, expect, it } from 'vitest'
import {
  calculatePrice,
  validatePricingRulesCoverage,
} from '@/modules/courts/court.service'
import type { CourtPricingData, PricingRule } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

const SAMPLE_PRICING: CourtPricingData = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '08:00',
      to: '18:00',
      prices: { '60': 800000, '120': 1500000 },
    },
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '18:00',
      to: '23:00',
      prices: { '60': 1200000, '120': 2300000 },
    },
    {
      days: ['fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      prices: { '60': 1500000, '120': 2900000 },
    },
  ],
}

// ART = UTC-3. Use UTC dates and subtract 3h to land at ART time.
// Mon 09:00 UTC = Mon 06:00 ART → but we want Mon 09:00 ART = Mon 12:00 UTC
function artDate(isoWeekday: string, hhmmART: string): Date {
  const [h, m] = hhmmART.split(':').map(Number)
  const utcH = (h ?? 0) + 3 // ART → UTC
  // Use 2026-04-27 (Monday) as reference. Day offsets: mon=0 fri=4 sat=5
  const dayOffsets: Record<string, number> = {
    mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
  }
  const base = new Date('2026-04-27T00:00:00Z') // Monday 00:00 UTC
  base.setUTCDate(base.getUTCDate() + (dayOffsets[isoWeekday] ?? 0))
  base.setUTCHours(utcH % 24, m ?? 0, 0, 0)
  // handle next-day overflow (e.g. utcH >= 24)
  if (utcH >= 24) base.setUTCDate(base.getUTCDate() + 1)
  return base
}

describe('calculatePrice', () => {
  it('weekday morning 60min → 800000', () => {
    const date = artDate('mon', '09:00')
    expect(calculatePrice(SAMPLE_PRICING, date, 60)).toBe(800000)
  })

  it('weekend night 120min → 2900000', () => {
    const date = artDate('sat', '21:00')
    expect(calculatePrice(SAMPLE_PRICING, date, 120)).toBe(2900000)
  })

  it('weekday at rule boundary 18:00 → 1200000', () => {
    // Exactly at from=18:00 → falls in second rule [18:00, 23:00)
    const date = artDate('mon', '18:00')
    expect(calculatePrice(SAMPLE_PRICING, date, 60)).toBe(1200000)
  })

  it('unsupported duration 90min → null', () => {
    const date = artDate('mon', '09:00')
    // TypeScript prevents 90 at compile time, cast for test
    expect(calculatePrice(SAMPLE_PRICING, date, 90 as 60 | 120)).toBeNull()
  })
})

const FULL_OPENING_HOURS: OpeningHours = {
  mon: { open: '08:00', close: '23:00' },
  tue: { open: '08:00', close: '23:00' },
  wed: { open: '08:00', close: '23:00' },
  thu: { open: '08:00', close: '23:00' },
  fri: { open: '08:00', close: '23:00' },
  sat: { open: '08:00', close: '23:00' },
  sun: { open: '08:00', close: '23:00' },
}

describe('validatePricingRulesCoverage', () => {
  it('full coverage → {valid: true, gaps: []}', () => {
    const result = validatePricingRulesCoverage(SAMPLE_PRICING.rules, FULL_OPENING_HOURS)
    expect(result.valid).toBe(true)
    expect(result.gaps).toHaveLength(0)
  })

  it('missing weekend coverage → {valid: false, gaps include sat 08:00}', () => {
    const weekdayOnlyRules: PricingRule[] = [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        from: '08:00',
        to: '23:00',
        prices: { '60': 800000, '120': 1500000 },
      },
    ]
    const result = validatePricingRulesCoverage(weekdayOnlyRules, FULL_OPENING_HOURS)
    expect(result.valid).toBe(false)
    expect(result.gaps.some((g) => g.day === 'sat' && g.time === '08:00')).toBe(true)
    expect(result.gaps.some((g) => g.day === 'sun')).toBe(true)
  })

  it('closed day skipped — no gaps for it', () => {
    const hours: OpeningHours = {
      ...FULL_OPENING_HOURS,
      sun: { open: '08:00', close: '23:00', closed: true },
    }
    const weekdayFriRules: PricingRule[] = [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
        from: '08:00',
        to: '23:00',
        prices: { '60': 800000, '120': 1500000 },
      },
    ]
    const result = validatePricingRulesCoverage(weekdayFriRules, hours)
    expect(result.valid).toBe(true)
  })
})
