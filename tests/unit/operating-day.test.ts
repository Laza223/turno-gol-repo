import { describe, expect, it } from 'vitest'
import {
  END_OF_DAY_MINS,
  effectiveCloseMins,
  endLabelFromMins,
  normalizeRangeToOpenDay,
  nightCutoffMins,
  operatingDateOf,
  operatingDayRangeUtc,
} from '@/shared/time/operating-day'
import { artDateOf, artDayRangeUtc } from '@/shared/time/art-date'

const sameDayAllWeek = {
  mon: { open: '08:00', close: '23:00' },
  tue: { open: '08:00', close: '23:00' },
  wed: { open: '08:00', close: '23:00' },
  thu: { open: '08:00', close: '23:00' },
  fri: { open: '08:00', close: '23:00' },
  sat: { open: '08:00', close: '23:00' },
  sun: { open: '08:00', close: '23:00' },
}

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

describe('nightCutoffMins', () => {
  it('closesNextDay apagado: cutoff siempre 0, sin importar los horarios', () => {
    expect(nightCutoffMins(sameDayAllWeek, false)).toBe(0)
    expect(
      nightCutoffMins({ ...sameDayAllWeek, fri: { open: '20:00', close: '04:00' } }, false),
    ).toBe(0)
  })

  it('closesNextDay prendido pero ningún día cruza medianoche: cutoff 0', () => {
    expect(nightCutoffMins(sameDayAllWeek, true)).toBe(0)
  })

  it('cierre 00:00 (medianoche) no cuenta como post-medianoche', () => {
    expect(
      nightCutoffMins({ ...sameDayAllWeek, sat: { open: '08:00', close: '00:00' } }, true),
    ).toBe(0)
  })

  it('un solo día post-medianoche: cutoff = cuánto se extiende ese día', () => {
    // Viernes cierra 02:00 → se extiende 120 min más allá de medianoche.
    expect(
      nightCutoffMins({ ...sameDayAllWeek, fri: { open: '20:00', close: '02:00' } }, true),
    ).toBe(120)
  })

  it('varios días post-medianoche: cutoff = el máximo entre todos', () => {
    expect(
      nightCutoffMins(
        {
          ...sameDayAllWeek,
          fri: { open: '20:00', close: '02:00' }, // +120
          sat: { open: '20:00', close: '04:00' }, // +240
        },
        true,
      ),
    ).toBe(240)
  })

  it('un día marcado closed no infla el cutoff con su horario viejo', () => {
    // sun quedó "cerrado" pero conserva un close de madrugada (04:00) de cuando
    // operaba — opening-hours.schema.ts:110 documenta que ese horario no se
    // valida ni debe usarse mientras closed=true.
    expect(
      nightCutoffMins(
        {
          ...sameDayAllWeek,
          fri: { open: '20:00', close: '02:00' }, // +120, día activo
          sun: { open: '20:00', close: '04:00', closed: true }, // +240, pero cerrado
        },
        true,
      ),
    ).toBe(120)
  })
})

describe('operatingDateOf', () => {
  it('cutoff 0: idéntico a artDateOf (fast path, tenants normales)', () => {
    const instant = new Date('2026-07-23T04:30:00.000Z') // 01:30 ART
    expect(operatingDateOf(instant, 0)).toBe(artDateOf(instant))
  })

  it('madrugada dentro del cutoff pertenece al día operativo anterior', () => {
    // 2026-07-23T04:30:00Z = 01:30 ART del 23 (minutos=90 < cutoff=120) → día 22.
    const sale = new Date('2026-07-23T04:30:00.000Z')
    expect(operatingDateOf(sale, 120)).toBe('2026-07-22')
  })

  it('hora fuera del cutoff pertenece al día calendario normal', () => {
    // 2026-07-23T06:00:00Z = 03:00 ART del 23 (minutos=180 >= cutoff=120) → día 23.
    const sale = new Date('2026-07-23T06:00:00.000Z')
    expect(operatingDateOf(sale, 120)).toBe('2026-07-23')
  })

  it('frontera exacta del cutoff cae del lado del día actual', () => {
    // 2026-07-23T05:00:00Z = 02:00 ART exacto, cutoff=120 → ya es día 23.
    const sale = new Date('2026-07-23T05:00:00.000Z')
    expect(operatingDateOf(sale, 120)).toBe('2026-07-23')
  })
})

describe('operatingDayRangeUtc', () => {
  it('cutoff 0: idéntico a artDayRangeUtc (0 regresión tenants normales)', () => {
    const plain = artDayRangeUtc('2026-07-22')
    const shifted = operatingDayRangeUtc('2026-07-22', 0)
    expect(shifted.fromUtc.toISOString()).toBe(plain.fromUtc.toISOString())
    expect(shifted.toUtc.toISOString()).toBe(plain.toUtc.toISOString())
  })

  it('cutoff > 0: el rango se corre uniformemente hacia adelante', () => {
    const { fromUtc, toUtc } = operatingDayRangeUtc('2026-07-22', 120)
    expect(fromUtc.toISOString()).toBe('2026-07-22T05:00:00.000Z')
    expect(toUtc.toISOString()).toBe('2026-07-23T05:00:00.000Z')
  })

  it('una venta de madrugada cae en el día operativo anterior, no en el calendario', () => {
    // 01:30 ART del 23 → con cutoff 120 pertenece al día operativo 22.
    const sale = new Date('2026-07-23T04:30:00.000Z')
    const opDay22 = operatingDayRangeUtc('2026-07-22', 120)
    const opDay23 = operatingDayRangeUtc('2026-07-23', 120)
    expect(sale >= opDay22.fromUtc && sale < opDay22.toUtc).toBe(true)
    expect(sale >= opDay23.fromUtc && sale < opDay23.toUtc).toBe(false)
  })
})
