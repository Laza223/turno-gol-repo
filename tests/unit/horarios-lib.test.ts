import { describe, expect, it } from 'vitest'
import {
  deriveScheduleView,
  effectiveDay,
  needsNextDayHint,
  type LooseOpeningHours,
} from '@/app/(admin)/settings/horarios/horarios-lib'
import { DAY_KEYS } from '@/shared/time/week-days'

const UNIFORM: LooseOpeningHours = Object.fromEntries(
  DAY_KEYS.map((d) => [d, { open: '08:00', close: '23:00' }]),
)

describe('deriveScheduleView', () => {
  it('todos los días iguales → todos en modo general', () => {
    const view = deriveScheduleView(UNIFORM)
    expect(view.general).toEqual({ open: '08:00', close: '23:00' })
    for (const day of DAY_KEYS) {
      expect(view.days[day].mode).toBe('general')
    }
  })

  it('el general es el par más frecuente; los que difieren quedan en custom', () => {
    const view = deriveScheduleView({
      ...UNIFORM,
      sat: { open: '09:00', close: '23:00' },
      sun: { open: '09:00', close: '23:00' },
    })
    expect(view.general).toEqual({ open: '08:00', close: '23:00' })
    expect(view.days.sat).toEqual({ mode: 'custom', open: '09:00', close: '23:00' })
    expect(view.days.mon.mode).toBe('general')
  })

  it('empate de frecuencia → gana el par del primer día en orden lun..dom', () => {
    // lun-mié 08-23 (3) vs jue-sáb 10-22 (3) vs dom cerrado.
    const view = deriveScheduleView({
      mon: { open: '08:00', close: '23:00' },
      tue: { open: '08:00', close: '23:00' },
      wed: { open: '08:00', close: '23:00' },
      thu: { open: '10:00', close: '22:00' },
      fri: { open: '10:00', close: '22:00' },
      sat: { open: '10:00', close: '22:00' },
      sun: { open: '08:00', close: '23:00', closed: true },
    })
    expect(view.general).toEqual({ open: '08:00', close: '23:00' })
    expect(view.days.thu.mode).toBe('custom')
    expect(view.days.sun.mode).toBe('closed')
  })

  it('días cerrados no votan para el general', () => {
    const view = deriveScheduleView({
      ...UNIFORM,
      mon: { open: '10:00', close: '20:00', closed: true },
      tue: { open: '10:00', close: '20:00', closed: true },
      wed: { open: '10:00', close: '20:00', closed: true },
      thu: { open: '10:00', close: '20:00', closed: true },
    })
    // Solo vie/sáb/dom abiertos con 08-23 → ese es el general.
    expect(view.general).toEqual({ open: '08:00', close: '23:00' })
  })

  it('entrada vacía o incompleta no explota (contrato hours={{}})', () => {
    const view = deriveScheduleView({})
    expect(view.general).toEqual({ open: '08:00', close: '23:00' })
    expect(view.days.mon.mode).toBe('general')
    expect(deriveScheduleView(undefined).days.sun.mode).toBe('general')
  })
})

describe('effectiveDay — round-trip con la persistencia', () => {
  it('modo general hereda el par general; custom y closed conservan el propio', () => {
    const view = deriveScheduleView({
      ...UNIFORM,
      sat: { open: '09:00', close: '22:00' },
      sun: { open: '10:00', close: '20:00', closed: true },
    })
    expect(effectiveDay(view, 'mon')).toEqual({ open: '08:00', close: '23:00', closed: false })
    expect(effectiveDay(view, 'sat')).toEqual({ open: '09:00', close: '22:00', closed: false })
    expect(effectiveDay(view, 'sun')).toEqual({ open: '10:00', close: '20:00', closed: true })
  })

  it('derivar y expandir reproduce el OpeningHours original', () => {
    const original: LooseOpeningHours = {
      ...UNIFORM,
      wed: { open: '14:00', close: '23:00' },
      sun: { open: '08:00', close: '23:00', closed: true },
    }
    const view = deriveScheduleView(original)
    for (const day of DAY_KEYS) {
      const e = effectiveDay(view, day)
      expect({ open: e.open, close: e.close, closed: e.closed }).toEqual({
        open: original[day]!.open!,
        close: original[day]!.close!,
        closed: original[day]!.closed === true,
      })
    }
  })

  it('cambiar el general propaga a los días en modo general, no a los custom', () => {
    const view = deriveScheduleView({
      ...UNIFORM,
      sat: { open: '09:00', close: '22:00' },
    })
    const edited = { ...view, general: { open: '07:00', close: '22:00' } }
    expect(effectiveDay(edited, 'mon')).toEqual({ open: '07:00', close: '22:00', closed: false })
    expect(effectiveDay(edited, 'sat')).toEqual({ open: '09:00', close: '22:00', closed: false })
  })
})

describe('needsNextDayHint', () => {
  it('cierre <= apertura sin el flag → hint', () => {
    const view = deriveScheduleView({
      ...UNIFORM,
      fri: { open: '18:00', close: '02:00' },
    })
    expect(needsNextDayHint(view, false)).toBe(true)
    expect(needsNextDayHint(view, true)).toBe(false)
  })

  it("cierre '00:00' cuenta como medianoche (fin del día): sin hint", () => {
    const view = deriveScheduleView(
      Object.fromEntries(DAY_KEYS.map((d) => [d, { open: '18:00', close: '00:00' }])),
    )
    expect(needsNextDayHint(view, false)).toBe(false)
  })

  it('el día cerrado con horas invertidas no dispara el hint', () => {
    const view = deriveScheduleView({
      ...UNIFORM,
      mon: { open: '18:00', close: '02:00', closed: true },
    })
    expect(needsNextDayHint(view, false)).toBe(false)
  })
})
