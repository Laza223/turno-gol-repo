import { describe, expect, it } from 'vitest'
import {
  getMonthBounds,
  prevMonthStr,
  nextMonthStr,
  formatMonthLabel,
  calcAvailableMinutes,
  calcOccupancyPct,
  toCsv,
} from '@/modules/reports/report.utils'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

const ALL_DAY_HOURS: OpeningHours = {
  mon: { open: '08:00', close: '00:00' },
  tue: { open: '08:00', close: '00:00' },
  wed: { open: '08:00', close: '00:00' },
  thu: { open: '08:00', close: '00:00' },
  fri: { open: '08:00', close: '00:00' },
  sat: { open: '08:00', close: '00:00' },
  sun: { open: '08:00', close: '00:00' },
}

const CLOSED_MONDAYS: OpeningHours = {
  ...ALL_DAY_HOURS,
  mon: { open: '08:00', close: '00:00', closed: true },
}

describe('getMonthBounds', () => {
  it('returns UTC midnight for first and next month', () => {
    const { from, to } = getMonthBounds('2026-05')
    expect(from.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('handles December → January year boundary', () => {
    const { from, to } = getMonthBounds('2026-12')
    expect(from.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('prevMonthStr', () => {
  it('returns previous month', () => {
    expect(prevMonthStr('2026-05')).toBe('2026-04')
  })

  it('wraps January to previous year December', () => {
    expect(prevMonthStr('2026-01')).toBe('2025-12')
  })
})

describe('nextMonthStr', () => {
  it('advances month', () => {
    expect(nextMonthStr('2026-05')).toBe('2026-06')
  })

  it('wraps December to next year January', () => {
    expect(nextMonthStr('2026-12')).toBe('2027-01')
  })
})

describe('formatMonthLabel', () => {
  it('returns a non-empty string containing the year', () => {
    const label = formatMonthLabel('2026-05')
    expect(label).toContain('2026')
    expect(label.length).toBeGreaterThan(4)
  })
})

describe('calcAvailableMinutes', () => {
  // 08:00 to 00:00 = 960 minutes per day
  it('returns 960 × 7 for a full week with 1 court', () => {
    // 2026-05-04 (Mon) to 2026-05-11 (Mon) = 7 days
    const from = new Date('2026-05-04T00:00:00.000Z')
    const to = new Date('2026-05-11T00:00:00.000Z')
    expect(calcAvailableMinutes(from, to, ALL_DAY_HOURS, 1)).toBe(7 * 960)
  })

  it('skips days with closed: true', () => {
    const from = new Date('2026-05-04T00:00:00.000Z') // Monday
    const to = new Date('2026-05-11T00:00:00.000Z')
    // 1 Monday skipped → 6 open days
    expect(calcAvailableMinutes(from, to, CLOSED_MONDAYS, 1)).toBe(6 * 960)
  })

  it('scales linearly with courtCount', () => {
    const from = new Date('2026-05-04T00:00:00.000Z')
    const to = new Date('2026-05-05T00:00:00.000Z')
    expect(calcAvailableMinutes(from, to, ALL_DAY_HOURS, 3)).toBe(960 * 3)
  })

  it('returns 0 when courtCount is 0', () => {
    const from = new Date('2026-05-04T00:00:00.000Z')
    const to = new Date('2026-05-05T00:00:00.000Z')
    expect(calcAvailableMinutes(from, to, ALL_DAY_HOURS, 0)).toBe(0)
  })

  it('returns 0 for same from and to', () => {
    const d = new Date('2026-05-04T00:00:00.000Z')
    expect(calcAvailableMinutes(d, d, ALL_DAY_HOURS, 2)).toBe(0)
  })

  it('excludes days listed in closedDates', () => {
    // 2026-05-04 (Mon) to 2026-05-06 (Wed) = 2 days; close 2026-05-05 (Tue)
    const from = new Date('2026-05-04T00:00:00.000Z')
    const to = new Date('2026-05-06T00:00:00.000Z')
    expect(calcAvailableMinutes(from, to, ALL_DAY_HOURS, 1, ['2026-05-05'])).toBe(960)
  })
})

describe('calcOccupancyPct', () => {
  it('returns 0 when availableMinutes is 0', () => {
    expect(calcOccupancyPct(500, 0)).toBe(0)
  })

  it('returns 100 when fully booked', () => {
    expect(calcOccupancyPct(960, 960)).toBe(100)
  })

  it('returns 50 for half occupancy', () => {
    expect(calcOccupancyPct(480, 960)).toBe(50)
  })

  it('rounds to 1 decimal place', () => {
    expect(calcOccupancyPct(1, 3)).toBe(33.3)
  })
})

describe('toCsv', () => {
  it('returns empty string for empty array', () => {
    expect(toCsv([])).toBe('')
  })

  it('writes header row and data row', () => {
    const csv = toCsv([{ fecha: '2026-05-01', monto: 1000 }])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('fecha,monto')
    expect(lines[1]).toBe('2026-05-01,1000')
  })

  it('wraps values containing commas in double quotes', () => {
    const csv = toCsv([{ desc: 'hola, mundo' }])
    expect(csv).toContain('"hola, mundo"')
  })

  it('escapes embedded double quotes as double-double-quotes', () => {
    const csv = toCsv([{ desc: 'say "hi"' }])
    expect(csv).toContain('"say ""hi"""')
  })

  it('handles null and undefined values as empty strings', () => {
    const csv = toCsv([{ a: null, b: undefined }])
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toBe(',')
  })
})
