import { describe, expect, it } from 'vitest'
import {
  describeOpenStatus,
  getOpenStatus,
  hourPhrase,
  hoursOf,
  isDayClosed,
  isDayServed,
  nextOpenDay,
  nextOpening,
  wallClock,
  type ScheduleSource,
} from '@/lib/schedule/open-status'
import { openingHours } from '@/test/fixtures/tenant'

// Semana de referencia: mié 2026-10-14 · jue 15 · vie 16 · sáb 17 · dom 18 · lun 19.
// Todos los días 10:00–23:00; el viernes cierra a la 01:00 del sábado.
const day = (open: string, close: string, closed = false) => ({ open, close, closed })
const WEEK = {
  mon: day('10:00', '23:00'),
  tue: day('10:00', '23:00'),
  wed: day('10:00', '23:00'),
  thu: day('10:00', '23:00'),
  fri: day('10:00', '01:00'),
  sat: day('10:00', '23:00'),
  sun: day('10:00', '23:00'),
}
const schedule = (overrides: Partial<ScheduleSource> = {}): ScheduleSource => ({
  openingHours: openingHours(WEEK),
  closedDates: [],
  closesNextDay: true,
  ...overrides,
})
const at = (date: string, time: string) => ({ date, time })

describe('getOpenStatus', () => {
  it('mediodía de un día de atención: abierto hasta el cierre', () => {
    expect(getOpenStatus(at('2026-10-14', '12:00'), schedule())).toEqual({
      open: true,
      closesAt: '23:00',
    })
  })

  it('antes de abrir: cerrado, y dice a qué hora abre hoy', () => {
    expect(getOpenStatus(at('2026-10-14', '09:59'), schedule())).toEqual({
      open: false,
      opensAt: '10:00',
    })
  })

  it('justo a la hora de apertura ya está abierto; justo a la de cierre ya no', () => {
    expect(getOpenStatus(at('2026-10-14', '10:00'), schedule()).open).toBe(true)
    expect(getOpenStatus(at('2026-10-14', '23:00'), schedule())).toEqual({
      open: false,
      opensAt: null,
    })
  })

  it('00:30 de un complejo que cierra a la 01:00: abierto por el horario de AYER', () => {
    expect(getOpenStatus(at('2026-10-17', '00:30'), schedule())).toEqual({
      open: true,
      closesAt: '01:00',
    })
  })

  it('02:00 del mismo complejo: ya cerró y abre hoy a las 10:00', () => {
    expect(getOpenStatus(at('2026-10-17', '02:00'), schedule())).toEqual({
      open: false,
      opensAt: '10:00',
    })
  })

  it('el viernes a las 23:30 sigue abierto: el cierre es de madrugada', () => {
    expect(getOpenStatus(at('2026-10-16', '23:30'), schedule())).toEqual({
      open: true,
      closesAt: '01:00',
    })
  })

  it('un día en closedDates está cerrado y no tiene próxima apertura hoy', () => {
    const s = schedule({ closedDates: ['2026-10-14'] })
    expect(getOpenStatus(at('2026-10-14', '12:00'), s)).toEqual({ open: false, opensAt: null })
    expect(getOpenStatus(at('2026-10-14', '08:00'), s)).toEqual({ open: false, opensAt: null })
  })

  it('un día de la semana marcado closed está cerrado', () => {
    const s = schedule({
      openingHours: openingHours({ wed: day('10:00', '23:00', true) }),
    })
    expect(getOpenStatus(at('2026-10-14', '12:00'), s)).toEqual({ open: false, opensAt: null })
  })

  it('si AYER era feriado, su madrugada no cuenta: a las 00:30 no hay nada abierto', () => {
    const s = schedule({ closedDates: ['2026-10-16'] })
    expect(getOpenStatus(at('2026-10-17', '00:30'), s)).toEqual({ open: false, opensAt: '10:00' })
  })

  it('si HOY es feriado pero ayer cerraba de madrugada, esa madrugada sigue siendo de ayer', () => {
    const s = schedule({ closedDates: ['2026-10-17'] })
    expect(getOpenStatus(at('2026-10-17', '00:30'), s)).toEqual({ open: true, closesAt: '01:00' })
    expect(getOpenStatus(at('2026-10-17', '12:00'), s)).toEqual({ open: false, opensAt: null })
  })

  it('sin closes_next_day, 10:00–01:00 no avanza: no hay turnos ni está abierto', () => {
    const s = schedule({ closesNextDay: false })
    expect(getOpenStatus(at('2026-10-16', '12:00'), s)).toEqual({ open: false, opensAt: null })
    expect(getOpenStatus(at('2026-10-17', '00:30'), s)).toEqual({ open: false, opensAt: '10:00' })
  })

  it('con closes_next_day, un cierre antes de medianoche no extiende el día siguiente', () => {
    // Martes 00:30; el lunes cerró a las 23:00.
    expect(getOpenStatus(at('2026-10-20', '00:30'), schedule())).toEqual({
      open: false,
      opensAt: '10:00',
    })
  })

  it('un día sin entrada en openingHours cae al 08:00–23:00 de siempre', () => {
    const s = schedule({ openingHours: {} as ScheduleSource['openingHours'] })
    expect(getOpenStatus(at('2026-10-14', '12:00'), s)).toEqual({ open: true, closesAt: '23:00' })
    expect(getOpenStatus(at('2026-10-14', '07:00'), s)).toEqual({ open: false, opensAt: '08:00' })
  })
})

describe('isDayClosed', () => {
  it('cerrado por closedDates o por closed; abierto en el resto', () => {
    const s = schedule({
      closedDates: ['2026-10-14'],
      openingHours: openingHours({ thu: day('10:00', '23:00', true) }),
    })
    expect(isDayClosed('2026-10-14', s)).toBe(true) // feriado
    expect(isDayClosed('2026-10-15', s)).toBe(true) // jueves cerrado
    expect(isDayClosed('2026-10-16', s)).toBe(false)
  })
})

describe('nextOpenDay', () => {
  const s = schedule({
    closedDates: ['2026-10-19'],
    openingHours: openingHours({
      sat: day('10:00', '23:00', true),
      sun: day('10:00', '23:00', true),
    }),
  })

  it('salta fines de semana cerrados y feriados, y no incluye el día de partida', () => {
    expect(nextOpenDay('2026-10-16', '2026-10-22', s)).toBe('2026-10-20') // vie → mar (sáb, dom, lun cerrados)
    expect(nextOpenDay('2026-10-14', '2026-10-22', s)).toBe('2026-10-15')
  })

  it('respeta el tope de la ventana: maxDate entra, lo que sigue no', () => {
    expect(nextOpenDay('2026-10-16', '2026-10-20', s)).toBe('2026-10-20')
    expect(nextOpenDay('2026-10-16', '2026-10-19', s)).toBeNull()
  })

  it('sin días posteriores dentro del tope no hay próximo', () => {
    expect(nextOpenDay('2026-10-22', '2026-10-22', s)).toBeNull()
  })
})

describe('hourPhrase', () => {
  it('"la" para la 01:xx, "las" para el resto (incluida la medianoche)', () => {
    expect(hourPhrase('01:00')).toBe('la 01:00')
    expect(hourPhrase('00:00')).toBe('las 00:00')
    expect(hourPhrase('02:30')).toBe('las 02:30')
    expect(hourPhrase('23:00')).toBe('las 23:00')
    expect(hourPhrase('13:00')).toBe('las 13:00')
  })

  it('el cierre guardado como 24:00 se dice 00:00', () => {
    expect(hourPhrase('24:00')).toBe('las 00:00')
  })
})

describe('nextOpening', () => {
  const s = schedule({
    closedDates: ['2026-10-19'],
    openingHours: openingHours({
      sat: day('10:00', '23:00', true),
      sun: day('10:00', '23:00', true),
      tue: day('09:30', '23:00'),
    }),
  })

  it('mañana, si abre: el día y su hora de apertura', () => {
    expect(nextOpening('2026-10-14', s)).toEqual({ date: '2026-10-15', opensAt: '09:00' })
  })

  it('salta fines de semana cerrados y feriados y trae la apertura de ESE día', () => {
    // Viernes 16: sáb y dom cerrados, lun 19 feriado → martes 20 a las 09:30.
    expect(nextOpening('2026-10-16', s)).toEqual({ date: '2026-10-20', opensAt: '09:30' })
  })

  it('si no abre en toda la semana que sigue, no hay próxima apertura', () => {
    const closed = schedule({
      openingHours: openingHours({
        mon: day('10:00', '23:00', true),
        tue: day('10:00', '23:00', true),
        wed: day('10:00', '23:00', true),
        thu: day('10:00', '23:00', true),
        fri: day('10:00', '23:00', true),
        sat: day('10:00', '23:00', true),
        sun: day('10:00', '23:00', true),
      }),
    })
    expect(nextOpening('2026-10-14', closed)).toBeNull()
  })
})

describe('wallClock', () => {
  it('el cierre a medianoche (24:00) se dice 00:00; el resto, tal cual y sin segundos', () => {
    expect(wallClock('24:00')).toBe('00:00')
    expect(wallClock('01:00')).toBe('01:00')
    expect(wallClock('09:30:00')).toBe('09:30')
  })
})

// Los demás días, cerrados: se arma una semana COMPLETA (sin caer a los valores por defecto).
const onlyOpen = (...keys: (keyof typeof WEEK)[]) =>
  openingHours(
    Object.fromEntries(
      Object.entries(WEEK).map(([key, hours]) => [
        key,
        keys.includes(key as keyof typeof WEEK) ? hours : { ...hours, closed: true },
      ]),
    ),
  )

describe('isDayServed', () => {
  it('abierto y con horario que avanza: se atiende', () => {
    expect(isDayServed('2026-10-14', schedule())).toBe(true)
    expect(isDayServed('2026-10-16', schedule())).toBe(true) // viernes hasta la 01:00 con closes_next_day
  })

  it('feriado o día cerrado de la semana: no se atiende', () => {
    expect(isDayServed('2026-10-14', schedule({ closedDates: ['2026-10-14'] }))).toBe(false)
    expect(isDayServed('2026-10-14', schedule({ openingHours: onlyOpen('thu') }))).toBe(false)
  })

  it('10:00–01:00 sin closes_next_day no genera turnos: no se atiende aunque no figure cerrado', () => {
    const s = schedule({ closesNextDay: false })
    expect(isDayServed('2026-10-16', s)).toBe(false)
    expect(isDayServed('2026-10-15', s)).toBe(true)
  })

  it('el cierre a medianoche (24:00) cuenta como horario que avanza', () => {
    const s = schedule({ openingHours: openingHours({ ...WEEK, wed: day('10:00', '24:00') }) })
    expect(isDayServed('2026-10-14', s)).toBe(true)
  })
})

describe('describeOpenStatus', () => {
  const text = (date: string, time: string, s: ScheduleSource = schedule()) =>
    describeOpenStatus(at(date, time), s)

  it('abierto: hasta qué hora, y el color es de abierto', () => {
    expect(text('2026-10-14', '12:00')).toEqual({ open: true, text: 'Abierto · hasta las 23:00' })
  })

  it('abierto de madrugada por el día de ayer: "hasta la 01:00"', () => {
    expect(text('2026-10-17', '00:30')).toEqual({ open: true, text: 'Abierto · hasta la 01:00' })
  })

  it('el cierre guardado como 24:00 se dice "las 00:00"', () => {
    const s = schedule({ openingHours: openingHours({ ...WEEK, wed: day('10:00', '24:00') }) })
    expect(text('2026-10-14', '12:00', s).text).toBe('Abierto · hasta las 00:00')
  })

  it('todavía no abrió hoy: "Cerrado · abre a las 10:00"', () => {
    expect(text('2026-10-14', '09:59')).toEqual({
      open: false,
      text: 'Cerrado · abre a las 10:00',
    })
  })

  it('ya cerró y abre mañana: "Cerró por hoy · abre mañana a las 10:00"', () => {
    expect(text('2026-10-14', '23:30')).toEqual({
      open: false,
      text: 'Cerró por hoy · abre mañana a las 10:00',
    })
  })

  it('ya cerró y la próxima apertura es esta semana: dice el día ("abre el lunes")', () => {
    // Jueves 15 a la noche; vie, sáb y dom cerrados → lunes 19.
    const s = schedule({ openingHours: onlyOpen('mon', 'tue', 'wed', 'thu') })
    expect(text('2026-10-15', '23:30', s).text).toBe('Cerró por hoy · abre el lunes a las 10:00')
  })

  it('si la próxima apertura queda a más de 6 días, dice la fecha ("abre el lunes 26")', () => {
    // Solo abre los lunes: el lunes 19 ya cerró y el que sigue es el 26.
    const s = schedule({ openingHours: onlyOpen('mon') })
    expect(text('2026-10-19', '23:30', s).text).toBe('Cerró por hoy · abre el lunes 26 a las 10:00')
  })

  it('a 6 días justos todavía alcanza con el día de la semana, sin número', () => {
    // Abre lunes y domingo: el lunes 19 ya cerró y el domingo 25 queda justo a 6 días.
    const s = schedule({ openingHours: onlyOpen('mon', 'sun') })
    expect(text('2026-10-19', '23:30', s).text).toBe('Cerró por hoy · abre el domingo a las 10:00')
  })

  it('hoy no se atiende en todo el día (feriado o día cerrado): "Cerrado hoy"', () => {
    expect(text('2026-10-14', '12:00', schedule({ closedDates: ['2026-10-14'] })).text).toBe(
      'Cerrado hoy',
    )
    expect(text('2026-10-14', '12:00', schedule({ openingHours: onlyOpen('thu') })).text).toBe(
      'Cerrado hoy',
    )
  })

  it('un horario que no avanza (cierre antes de la apertura sin closes_next_day) es "Cerrado hoy", no "Cerró por hoy"', () => {
    const s = schedule({ closesNextDay: false })
    expect(text('2026-10-16', '12:00', s)).toEqual({ open: false, text: 'Cerrado hoy' })
  })

  it('la próxima apertura salta los días que no generan turnos', () => {
    // Sin closes_next_day el viernes (10:00–01:00) no atiende: jueves a la noche → sábado.
    const s = schedule({ closesNextDay: false })
    expect(nextOpening('2026-10-15', s)).toEqual({ date: '2026-10-17', opensAt: '10:00' })
    expect(text('2026-10-15', '23:30', s).text).toBe('Cerró por hoy · abre el sábado a las 10:00')
  })

  it('si en la semana que sigue no abre nunca, no inventa una apertura', () => {
    // Solo los miércoles, y el miércoles que viene (21) es feriado.
    const s = schedule({ openingHours: onlyOpen('wed'), closedDates: ['2026-10-21'] })
    expect(text('2026-10-14', '23:30', s)).toEqual({ open: false, text: 'Cerró por hoy' })
  })
})

describe('hoursOf', () => {
  it('trae apertura, cierre y si el día no se atiende', () => {
    expect(hoursOf('2026-10-16', schedule())).toEqual({
      open: '10:00',
      close: '01:00',
      closed: false,
    })
    expect(hoursOf('2026-10-14', schedule({ closedDates: ['2026-10-14'] })).closed).toBe(true)
  })

  it('un día sin entrada cae a 08:00-23:00, igual que la disponibilidad pública', () => {
    const { mon: _omit, ...rest } = schedule().openingHours
    expect(
      hoursOf('2026-10-19', schedule({ openingHours: rest as ScheduleSource['openingHours'] })),
    ).toEqual({ open: '08:00', close: '23:00', closed: false })
  })
})
