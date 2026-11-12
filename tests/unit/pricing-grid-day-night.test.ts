import { describe, expect, it } from 'vitest'
import {
  dayNightRulesFromOpeningHours,
  uniformRulesFromOpeningHours,
} from '@/modules/courts/pricing-grid'
import { validatePricingRulesCoverage } from '@/modules/courts/court.service'
import { priceForDateSlot } from '@/lib/booking/pricing'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

const KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function week(open: string, close: string): OpeningHours {
  const out = {} as OpeningHours
  for (const k of KEYS) out[k] = { open, close, closed: false }
  return out
}

const ALL_DAYS = [...KEYS]
const DAY = 6_000_000
const NIGHT = 8_000_000

describe('dayNightRulesFromOpeningHours', () => {
  it('parte el horario en el corte: día antes, noche después', () => {
    expect(
      dayNightRulesFromOpeningHours(week('08:00', '00:00'), false, DAY, NIGHT, '18:00'),
    ).toEqual([
      { days: ALL_DAYS, from: '08:00', to: '18:00', price: DAY },
      { days: ALL_DAYS, from: '18:00', to: '00:00', price: NIGHT },
    ])
  })

  it('con noche igual a día es la uniforme', () => {
    const oh = week('08:00', '00:00')
    expect(dayNightRulesFromOpeningHours(oh, false, DAY, DAY, '18:00')).toEqual(
      uniformRulesFromOpeningHours(oh, false, DAY),
    )
  })

  it('corte antes de la apertura: todo noche', () => {
    expect(
      dayNightRulesFromOpeningHours(week('19:00', '00:00'), false, DAY, NIGHT, '18:00'),
    ).toEqual([{ days: ALL_DAYS, from: '19:00', to: '00:00', price: NIGHT }])
  })

  it('corte en la apertura: todo noche', () => {
    expect(
      dayNightRulesFromOpeningHours(week('18:00', '00:00'), false, DAY, NIGHT, '18:00'),
    ).toEqual([{ days: ALL_DAYS, from: '18:00', to: '00:00', price: NIGHT }])
  })

  it('corte después del cierre: todo día', () => {
    expect(
      dayNightRulesFromOpeningHours(week('08:00', '17:00'), false, DAY, NIGHT, '18:00'),
    ).toEqual([{ days: ALL_DAYS, from: '08:00', to: '17:00', price: DAY }])
  })

  it('cierre pasada la medianoche: la madrugada es noche y queda en el día operativo', () => {
    const oh = week('08:00', '02:00')
    const rules = dayNightRulesFromOpeningHours(oh, true, DAY, NIGHT, '18:00')
    expect(rules).toEqual([
      { days: ALL_DAYS, from: '00:00', to: '02:00', price: NIGHT },
      { days: ALL_DAYS, from: '08:00', to: '18:00', price: DAY },
      { days: ALL_DAYS, from: '18:00', to: '00:00', price: NIGHT },
    ])
    expect(validatePricingRulesCoverage(rules, oh, true).valid).toBe(true)
    // El turno de la 01:00 del sábado es del viernes operativo: cobra noche.
    expect(priceForDateSlot({ rules }, '2026-11-13', '01:00')).toBe(NIGHT)
  })

  it('cierre de madrugada con corte pasada la medianoche no rompe la cobertura', () => {
    const oh = week('10:00', '03:00')
    const rules = dayNightRulesFromOpeningHours(oh, true, DAY, NIGHT, '23:00')
    expect(validatePricingRulesCoverage(rules, oh, true).valid).toBe(true)
  })

  it('cubre todo el horario en el caso común', () => {
    const oh = week('08:00', '00:00')
    const rules = dayNightRulesFromOpeningHours(oh, false, DAY, NIGHT, '18:00')
    expect(validatePricingRulesCoverage(rules, oh, false).valid).toBe(true)
  })

  it('respeta días cerrados', () => {
    const oh = week('08:00', '00:00')
    oh.sun = { open: '08:00', close: '00:00', closed: true }
    const rules = dayNightRulesFromOpeningHours(oh, false, DAY, NIGHT, '18:00')
    expect(rules.flatMap((r) => r.days)).not.toContain('sun')
  })
})
