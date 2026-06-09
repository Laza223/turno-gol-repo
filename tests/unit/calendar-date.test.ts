import { describe, expect, it } from 'vitest'
import { isValidCalendarDate, safeDateParam } from '@/shared/validation/calendar-date'

describe('isValidCalendarDate (#16)', () => {
  it('acepta fechas calendario reales', () => {
    expect(isValidCalendarDate('2026-06-08')).toBe(true)
    expect(isValidCalendarDate('2024-02-29')).toBe(true) // año bisiesto
    expect(isValidCalendarDate('2026-12-31')).toBe(true)
  })

  it('rechaza formato invalido', () => {
    expect(isValidCalendarDate('2026-6-8')).toBe(false)
    expect(isValidCalendarDate('basura')).toBe(false)
    expect(isValidCalendarDate('')).toBe(false)
    expect(isValidCalendarDate('2026/06/08')).toBe(false)
  })

  it('rechaza meses/dias imposibles y rollovers', () => {
    expect(isValidCalendarDate('2026-13-45')).toBe(false)
    expect(isValidCalendarDate('2026-00-10')).toBe(false)
    expect(isValidCalendarDate('2026-02-31')).toBe(false) // rollover a marzo
    expect(isValidCalendarDate('2025-02-29')).toBe(false) // no bisiesto
  })
})

describe('safeDateParam (#16)', () => {
  it('devuelve el valor si es una fecha valida', () => {
    expect(safeDateParam('2026-06-08', '2026-01-01')).toBe('2026-06-08')
  })

  it('cae al fallback si el valor es invalido o undefined', () => {
    expect(safeDateParam('2026-13-45', '2026-01-01')).toBe('2026-01-01')
    expect(safeDateParam(undefined, '2026-01-01')).toBe('2026-01-01')
    expect(safeDateParam('', '2026-01-01')).toBe('2026-01-01')
  })
})
