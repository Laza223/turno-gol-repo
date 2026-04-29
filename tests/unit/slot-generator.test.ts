import { describe, expect, it } from 'vitest'
import { generateSlotDates } from '@/modules/abonados/slot-generator'

describe('generateSlotDates', () => {
  it('returns first slot on startsOn when startsOn is already correct dayOfWeek', () => {
    // 2025-01-06 is a Monday (dayOfWeek=1)
    const result = generateSlotDates({
      dayOfWeek: 1,
      startsOn: '2025-01-06',
      endsOn: null,
      fromDate: '2025-01-06',
      count: 3,
      closedDates: [],
    })
    expect(result[0]).toBe('2025-01-06')
    expect(result[1]).toBe('2025-01-13')
    expect(result[2]).toBe('2025-01-20')
  })

  it('advances to next occurrence of dayOfWeek when fromDate is not target day', () => {
    // 2025-01-07 is a Tuesday; next Monday is 2025-01-13
    const result = generateSlotDates({
      dayOfWeek: 1,
      startsOn: '2025-01-07',
      endsOn: null,
      fromDate: '2025-01-07',
      count: 2,
      closedDates: [],
    })
    expect(result[0]).toBe('2025-01-13')
    expect(result[1]).toBe('2025-01-20')
  })

  it('skips closedDates', () => {
    // First Monday after 2025-01-06 would be 2025-01-06, but it is closed
    const result = generateSlotDates({
      dayOfWeek: 1,
      startsOn: '2025-01-06',
      endsOn: null,
      fromDate: '2025-01-06',
      count: 3,
      closedDates: ['2025-01-13'],
    })
    expect(result).toEqual(['2025-01-06', '2025-01-20', '2025-01-27'])
  })

  it('stops at endsOn (inclusive)', () => {
    const result = generateSlotDates({
      dayOfWeek: 1,
      startsOn: '2025-01-06',
      endsOn: '2025-01-20',
      fromDate: '2025-01-06',
      count: 10,
      closedDates: [],
    })
    expect(result).toEqual(['2025-01-06', '2025-01-13', '2025-01-20'])
  })

  it('returns at most count items', () => {
    const result = generateSlotDates({
      dayOfWeek: 1,
      startsOn: '2025-01-06',
      endsOn: null,
      fromDate: '2025-01-06',
      count: 3,
      closedDates: [],
    })
    expect(result).toHaveLength(3)
  })

  it('starts from fromDate when fromDate is later than startsOn', () => {
    // startsOn is 2025-01-06 (Mon), fromDate is 2025-02-03 (Mon)
    const result = generateSlotDates({
      dayOfWeek: 1,
      startsOn: '2025-01-06',
      endsOn: null,
      fromDate: '2025-02-03',
      count: 2,
      closedDates: [],
    })
    expect(result[0]).toBe('2025-02-03')
    expect(result[1]).toBe('2025-02-10')
  })

  it('returns empty array when endsOn is before first valid slot', () => {
    const result = generateSlotDates({
      dayOfWeek: 1,
      startsOn: '2025-01-07',
      endsOn: '2025-01-07',
      fromDate: '2025-01-07',
      count: 8,
      closedDates: [],
    })
    expect(result).toHaveLength(0)
  })
})
