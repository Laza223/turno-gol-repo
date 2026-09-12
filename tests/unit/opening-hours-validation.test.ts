import { describe, expect, it } from 'vitest'
import {
  closeMinutes,
  horariosFormDataToInput,
  horariosSchema,
  isValidDayRange,
  openMinutes,
} from '@/modules/tenants/opening-hours.schema'
import { DAY_KEYS } from '@/shared/time/week-days'

/**
 * BLOCKER (triage_fixes #4): sin validar close > open, el admin puede guardar
 * apertura=18:00/cierre=14:00 (o 22:00/06:00). generateSlots produce CERO slots
 * y la cancha queda silenciosamente no reservable online.
 */
const OK = { open: '08:00', close: '23:00' }

function week(overrides: Record<string, { open: string; close: string }> = {}) {
  return {
    mon: OK,
    tue: OK,
    wed: OK,
    thu: OK,
    fri: OK,
    sat: OK,
    sun: OK,
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
    expect(horariosSchema.safeParse(week({ mon: { open: '8', close: '23:00' } })).success).toBe(
      false,
    )
    expect(horariosSchema.safeParse(week({ mon: { open: '25:00', close: '26:00' } })).success).toBe(
      false,
    )
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

  // Rediseño 2026-07-02 (pages/horarios-precios.md §2.3): `closed` viaja con
  // cada día — antes el schema lo despojaba y el flag del onboarding se perdía.
  it('conserva closed y no valida las horas de un día cerrado', () => {
    const parsed = horariosSchema.safeParse(
      week({ sun: { open: '18:00', close: '02:00', closed: true } as never }),
    )
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.sun.closed).toBe(true)
      expect(parsed.data.mon.closed).toBe(false) // default
    }
  })

  it('rechaza la semana con los 7 días cerrados', () => {
    const allClosed = Object.fromEntries(
      Object.entries(week()).map(([k, v]) => [k, { ...(v as object), closed: true }]),
    )
    const result = horariosSchema.safeParse(allClosed)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/al menos un día/i)
    }
  })
})

// Cambio 1 (rediseño /settings/horarios): sin checkbox manual, `horariosFormDataToInput`
// deriva closesNextDay de los pares open/close que llegan en el FormData.
describe('horariosFormDataToInput — deriva closesNextDay (sin checkbox manual)', () => {
  type DayOverride = { open: string; close: string; closed?: boolean }

  function buildFormData(overrides: Partial<Record<string, DayOverride>> = {}): FormData {
    const fd = new FormData()
    for (const day of DAY_KEYS) {
      const d: DayOverride = overrides[day] ?? OK
      fd.set(`${day}_open`, d.open)
      fd.set(`${day}_close`, d.close)
      if (d.closed) fd.set(`${day}_closed`, 'on')
    }
    return fd
  }

  it('semana normal (todo close > open) → closesNextDay false', () => {
    expect(horariosFormDataToInput(buildFormData()).closesNextDay).toBe(false)
  })

  it('un día abierto con cierre <= apertura → closesNextDay true', () => {
    const input = horariosFormDataToInput(buildFormData({ fri: { open: '18:00', close: '02:00' } }))
    expect(input.closesNextDay).toBe(true)
  })

  it('el mismo rango invertido en un día CERRADO no dispara la derivación', () => {
    const input = horariosFormDataToInput(
      buildFormData({ mon: { open: '18:00', close: '02:00', closed: true } }),
    )
    expect(input.closesNextDay).toBe(false)
  })

  it("cierre '00:00' (medianoche = fin del día) no dispara la derivación", () => {
    const input = horariosFormDataToInput(buildFormData({ sat: { open: '18:00', close: '00:00' } }))
    expect(input.closesNextDay).toBe(false)
  })

  it('el resultado derivado sigue siendo válido para horariosSchema (mismo caso del BLOCKER #4)', () => {
    const parsed = horariosSchema.safeParse(
      horariosFormDataToInput(buildFormData({ fri: { open: '18:00', close: '02:00' } })),
    )
    expect(parsed.success).toBe(true)
  })

  it('un `closes_next_day=on` suelto en el FormData (vestigio, ya sin UI en settings) no se lee: el flag sale solo de la derivación', () => {
    const fd = buildFormData()
    fd.set('closes_next_day', 'on')
    expect(horariosFormDataToInput(fd).closesNextDay).toBe(false)
  })
})
