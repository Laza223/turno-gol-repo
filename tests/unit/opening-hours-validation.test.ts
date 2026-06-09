import { describe, expect, it } from 'vitest'
import {
  closeMinutes,
  horariosSchema,
  isValidDayRange,
  openMinutes,
} from '@/modules/tenants/opening-hours.schema'

/**
 * BLOCKER (triage_fixes #4): sin validar close > open, el admin puede guardar
 * apertura=18:00/cierre=14:00 (o 22:00/06:00). generateSlots produce CERO slots
 * y la cancha queda silenciosamente no reservable online.
 */
const OK = { open: '08:00', close: '23:00' }

function week(overrides: Record<string, { open: string; close: string }> = {}) {
  return {
    mon: OK, tue: OK, wed: OK, thu: OK, fri: OK, sat: OK, sun: OK,
    ...overrides,
  }
}

describe('isValidDayRange', () => {
  it('acepta cierre posterior a apertura', () => {
    expect(isValidDayRange('08:00', '23:00')).toBe(true)
    expect(isValidDayRange('00:00', '12:00')).toBe(true)
  })

  it('trata cierre 00:00 como medianoche (fin del día)', () => {
    expect(closeMinutes('00:00')).toBe(24 * 60)
    expect(openMinutes('00:00')).toBe(0)
    expect(isValidDayRange('20:00', '00:00')).toBe(true)
  })

  it('rechaza cierre anterior a apertura', () => {
    expect(isValidDayRange('18:00', '14:00')).toBe(false)
    expect(isValidDayRange('22:00', '06:00')).toBe(false)
  })

  it('rechaza cierre igual a apertura', () => {
    expect(isValidDayRange('10:00', '10:00')).toBe(false)
  })
})

describe('horariosSchema', () => {
  it('acepta una semana válida', () => {
    expect(horariosSchema.safeParse(week()).success).toBe(true)
  })

  it('rechaza un día con cierre <= apertura, con mensaje específico del día', () => {
    const result = horariosSchema.safeParse(week({ wed: { open: '18:00', close: '14:00' } }))
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues[0]
      expect(issue?.path).toEqual(['wed', 'close'])
      expect(issue?.message).toMatch(/Miércoles/)
      expect(issue?.message).toMatch(/posterior al de apertura/)
    }
  })

  it('rechaza formato de hora inválido', () => {
    expect(horariosSchema.safeParse(week({ mon: { open: '8', close: '23:00' } })).success).toBe(false)
    expect(horariosSchema.safeParse(week({ mon: { open: '25:00', close: '26:00' } })).success).toBe(false)
  })
})
