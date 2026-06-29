import { describe, expect, it } from 'vitest'
import {
  END_OF_DAY_MINS,
  effectiveCloseMins,
  endLabelFromMins,
  normalizeRangeToOpenDay,
} from '@/shared/time/operating-day'

describe('effectiveCloseMins', () => {
  it('close 00:00 = medianoche (fin del día) sin importar el flag', () => {
    expect(effectiveCloseMins('08:00', '00:00', false)).toBe(END_OF_DAY_MINS)
    expect(effectiveCloseMins('08:00', '00:00', true)).toBe(END_OF_DAY_MINS)
  })

  it('cierre same-day (close > open) no se toca con el flag prendido', () => {
    expect(effectiveCloseMins('08:00', '23:00', true)).toBe(23 * 60)
    expect(effectiveCloseMins('09:00', '23:00', false)).toBe(23 * 60)
  })

  it('flag apagado: un cierre post-medianoche queda como minutos crudos (inválido aguas arriba)', () => {
    // 02:00 = 120 < open 480 → sin el flag NO se interpreta como día siguiente.
    expect(effectiveCloseMins('08:00', '02:00', false)).toBe(120)
  })

  it('flag prendido: cierre post-medianoche se corre al día siguiente (+1440)', () => {
    expect(effectiveCloseMins('08:00', '02:00', true)).toBe(2 * 60 + END_OF_DAY_MINS) // 26:00
    expect(effectiveCloseMins('18:00', '01:00', true)).toBe(1 * 60 + END_OF_DAY_MINS) // 25:00
  })
})

describe('endLabelFromMins', () => {
  it('1440 (medianoche) se etiqueta 24:00 para pasar chk_time_valid', () => {
    expect(endLabelFromMins(END_OF_DAY_MINS)).toBe('24:00')
  })

  it('los fines post-medianoche vuelven a wall-clock normal', () => {
    expect(endLabelFromMins(25 * 60)).toBe('01:00')
    expect(endLabelFromMins(26 * 60)).toBe('02:00')
  })

  it('etiquetas same-day comunes', () => {
    expect(endLabelFromMins(9 * 60)).toBe('09:00')
    expect(endLabelFromMins(23 * 60)).toBe('23:00')
  })
})

describe('normalizeRangeToOpenDay', () => {
  const open = 8 * 60

  it('reserva post-medianoche (00:00–01:00) se corre al eje continuo', () => {
    expect(normalizeRangeToOpenDay(0, 60, open, true)).toEqual({
      startMins: END_OF_DAY_MINS,
      endMins: END_OF_DAY_MINS + 60,
    })
  })

  it('reserva 23:00–24:00 no se toca (start no es post-medianoche)', () => {
    expect(normalizeRangeToOpenDay(23 * 60, END_OF_DAY_MINS, open, true)).toEqual({
      startMins: 23 * 60,
      endMins: END_OF_DAY_MINS,
    })
  })

  it('sin el flag, nada se corre', () => {
    expect(normalizeRangeToOpenDay(0, 60, open, false)).toEqual({
      startMins: 0,
      endMins: 60,
    })
  })
})
