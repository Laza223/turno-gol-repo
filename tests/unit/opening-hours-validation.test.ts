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

  it('día operativo: con closesNextDay, un cierre post-medianoche es válido', () => {
    // Sin el flag: 08:00→02:00 es inválido (cero slots).
    expect(isValidDayRange('08:00', '02:00')).toBe(false)
    // Con el flag: 02:00 = madrugada del día siguiente → válido.
    expect(isValidDayRange('08:00', '02:00', true)).toBe(true)
    expect(isValidDayRange('18:00', '01:00', true)).toBe(true)
    // Un cierre same-day (23:00) sigue válido con el flag prendido.
    expect(isValidDayRange('09:00', '23:00', true)).toBe(true)
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

  it('día operativo: rechaza cierre post-medianoche sin el flag, lo acepta con el flag', () => {
    const late = week({ fri: { open: '18:00', close: '02:00' } })
    expect(horariosSchema.safeParse(late).success).toBe(false)
    expect(horariosSchema.safeParse({ ...late, closesNextDay: true }).success).toBe(true)
  })

  it('closesNextDay default false cuando no se manda', () => {
    const parsed = horariosSchema.safeParse(week())
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.closesNextDay).toBe(false)
  })
})
