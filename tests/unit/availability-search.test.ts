import { describe, expect, it } from 'vitest'
import {
  parseAvailabilitySearchParams,
  tenantMatchesRequestedSlot,
} from '@/modules/tenants/availability-search.service'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

// 2026-06-11 is a Thursday.
const DATE = '2026-06-11'

const day = (open: string, close: string, closed = false) => ({ open, close, closed })

function hours(overrides: Partial<OpeningHours> = {}): OpeningHours {
  const base = day('08:00', '23:00')
  return {
    mon: base, tue: base, wed: base, thu: base, fri: base, sat: base, sun: base,
    ...overrides,
  }
}

// "Now" well before the requested date so slots are never 'past' by accident.
const NOW = { nowDateStr: '2026-06-10', nowMins: 10 * 60 }

const cfg = (overrides: Partial<Parameters<typeof tenantMatchesRequestedSlot>[0]> = {}) => ({
  openingHours: hours(),
  closedDates: [] as string[],
  durationMins: 60,
  bookingAdvanceDays: 6,
  ...overrides,
})

describe('tenantMatchesRequestedSlot', () => {
  it('matches a requested time that is a free slot of the tenant grid', () => {
    expect(tenantMatchesRequestedSlot(cfg(), DATE, '20:00', NOW)).toBe(true)
  })

  it('rejects a time not aligned to the tenant grid (open 08:30 → slots at :30)', () => {
    const c = cfg({ openingHours: hours({ thu: day('08:30', '23:30') }) })
    expect(tenantMatchesRequestedSlot(c, DATE, '20:00', NOW)).toBe(false)
    expect(tenantMatchesRequestedSlot(c, DATE, '20:30', NOW)).toBe(true)
  })

  it('rejects when the requested day is closed', () => {
    const c = cfg({ openingHours: hours({ thu: day('08:00', '23:00', true) }) })
    expect(tenantMatchesRequestedSlot(c, DATE, '20:00', NOW)).toBe(false)
  })

  it('rejects when the date is in closed_dates', () => {
    expect(
      tenantMatchesRequestedSlot(cfg({ closedDates: [DATE] }), DATE, '20:00', NOW),
    ).toBe(false)
  })

  it('rejects a slot that already started today (past slot)', () => {
    const todayNow = { nowDateStr: DATE, nowMins: 20 * 60 + 30 }
    expect(tenantMatchesRequestedSlot(cfg(), DATE, '20:00', todayNow)).toBe(false)
    expect(tenantMatchesRequestedSlot(cfg(), DATE, '21:00', todayNow)).toBe(true)
  })

  it('respects 120-minute grids (only every other hour aligns)', () => {
    const c = cfg({ durationMins: 120 })
    expect(tenantMatchesRequestedSlot(c, DATE, '20:00', NOW)).toBe(true) // 08+12h, %120 = 0
    expect(tenantMatchesRequestedSlot(c, DATE, '21:00', NOW)).toBe(false)
  })

  it('treats close 00:00 as midnight: the 23:00 slot exists', () => {
    const c = cfg({ openingHours: hours({ thu: day('08:00', '00:00') }) })
    expect(tenantMatchesRequestedSlot(c, DATE, '23:00', NOW)).toBe(true)
  })

  it('rejects a slot that would end after closing time', () => {
    // close 23:00 → last 60' slot starts 22:00
    expect(tenantMatchesRequestedSlot(cfg(), DATE, '23:00', NOW)).toBe(false)
  })

  it('rejects dates beyond the tenant booking_advance_days window', () => {
    const c = cfg({ bookingAdvanceDays: 6 })
    // NOW is 2026-06-10; +6 days = 2026-06-16 is the max allowed date.
    expect(tenantMatchesRequestedSlot(c, '2026-06-17', '20:00', NOW)).toBe(false)
    expect(tenantMatchesRequestedSlot(c, '2026-06-16', '20:00', NOW)).toBe(true)
  })

  it('rejects past dates outright', () => {
    expect(tenantMatchesRequestedSlot(cfg(), '2026-06-09', '20:00', NOW)).toBe(false)
  })
})

describe('parseAvailabilitySearchParams', () => {
  it('returns date+time when both are valid', () => {
    expect(parseAvailabilitySearchParams({ date: DATE, time: '20:00' })).toEqual({
      date: DATE,
      time: '20:00',
    })
  })

  it('returns null when either is missing', () => {
    expect(parseAvailabilitySearchParams({ date: DATE })).toBeNull()
    expect(parseAvailabilitySearchParams({ time: '20:00' })).toBeNull()
    expect(parseAvailabilitySearchParams({})).toBeNull()
  })

  it('returns null on garbage instead of throwing (URL params are user input)', () => {
    expect(parseAvailabilitySearchParams({ date: '2026-02-30', time: '20:00' })).toBeNull()
    expect(parseAvailabilitySearchParams({ date: DATE, time: '25:99' })).toBeNull()
    expect(parseAvailabilitySearchParams({ date: 'mañana', time: 'tarde' })).toBeNull()
  })
})
