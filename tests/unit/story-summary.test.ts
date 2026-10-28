import { describe, expect, it } from 'vitest'
import type { AvailabilityResponse, PublicSlotStatus } from '@/modules/tenants/public.service'
import {
  buildStoryModel,
  freeHoursOf,
  STORY_FAILURE_MESSAGES,
} from '@/modules/tenants/story-summary'
import { MAX_HOURS } from '@/lib/story-image/model'

type Court = AvailabilityResponse['courts'][number]
type PublicSlot = Court['slots'][number]

const TODAY = '2026-09-29' // martes
const PORTAL = 'https://turnogol.app/m10'

function slot(time: string, status: PublicSlotStatus = 'free'): PublicSlot {
  return { time, duration: 60, status, price: 2500000 }
}

function court(id: string, slots: PublicSlot[]): Court {
  return {
    id,
    name: `Cancha ${id}`,
    surfaceType: 'synthetic',
    isCovered: false,
    hasLighting: true,
    format: 5,
    slots,
  }
}

function availability(courts: Court[], date = TODAY): AvailabilityResponse {
  return { date, courts }
}

const TENANT = {
  name: 'M10 Menotti',
  slug: 'm10',
  allowOnlineBooking: true,
}

function build(
  courts: Court[],
  overrides: { tenant?: Partial<typeof TENANT>; date?: string; portalUrl?: string } = {},
) {
  return buildStoryModel({
    tenant: { ...TENANT, ...overrides.tenant },
    availability: availability(courts, overrides.date),
    todayStr: TODAY,
    portalUrl: overrides.portalUrl ?? PORTAL,
  })
}

function model(...args: Parameters<typeof build>) {
  const result = build(...args)
  if (!result.ok) throw new Error(`esperaba ok, vino ${result.reason}`)
  return result.model
}

function buildOnly(courts: Court[], only: string[]) {
  return buildStoryModel({
    tenant: TENANT,
    availability: availability(courts),
    todayStr: TODAY,
    portalUrl: PORTAL,
    only,
  })
}

const hours = (n: number, from = 10) =>
  Array.from({ length: n }, (_, i) => slot(`${String(from + i).padStart(2, '0')}:00`))

describe('buildStoryModel — horas libres', () => {
  it('cuenta las canchas libres por hora y solo status free', () => {
    const m = model([
      court('A', [slot('17:00'), slot('18:00', 'occupied'), slot('19:00', 'held')]),
      court('B', [slot('17:00'), slot('18:00'), slot('19:00', 'past')]),
    ])
    expect(m.hours).toEqual([
      { time: '17:00', freeCourts: 2 },
      { time: '18:00', freeCourts: 1 },
    ])
  })

  it('respeta el orden operativo de un complejo que cierra pasada la medianoche', () => {
    const times = ['22:00', '23:00', '00:00', '01:00']
    const m = model([
      court(
        'A',
        times.map((t) => slot(t)),
      ),
    ])
    // Como texto '00:00' < '22:00': si alguien ordena el string, esto falla.
    expect(m.hours.map((h) => h.time)).toEqual(times)
  })

  it('una hora ocupada en la primera cancha y libre en la segunda no cambia de lugar', () => {
    const m = model([
      court('A', [slot('19:00', 'occupied'), slot('20:00'), slot('21:00')]),
      court('B', [slot('19:00'), slot('20:00', 'occupied'), slot('21:00')]),
    ])
    expect(m.hours).toEqual([
      { time: '19:00', freeCourts: 1 },
      { time: '20:00', freeCourts: 1 },
      { time: '21:00', freeCourts: 2 },
    ])
  })

  it(`muestra hasta ${MAX_HOURS} horarios sin recortar y sin "y N más"`, () => {
    const m = model([court('A', hours(MAX_HOURS))])
    expect(m.hours).toHaveLength(MAX_HOURS)
    expect(m.hiddenHours).toBe(0)
  })

  it('con más horarios que lugar muestra los primeros en orden y cuenta el resto', () => {
    const m = model([court('A', hours(MAX_HOURS + 3))])
    expect(m.hours.map((h) => h.time)).toEqual(['10:00', '11:00', '12:00', '13:00'])
    expect(m.hiddenHours).toBe(3)
  })

  it('un solo horario libre también arma la placa', () => {
    const m = model([court('A', [slot('21:00')])])
    expect(m.hours).toEqual([{ time: '21:00', freeCourts: 1 }])
    expect(m.hiddenHours).toBe(0)
  })
})

describe('buildStoryModel — horarios elegidos por el dueño', () => {
  const evening = [court('A', [...hours(6, 9), slot('20:00'), slot('21:00'), slot('22:00')])]

  it('muestra solo las horas elegidas, sin "y N más"', () => {
    const result = buildOnly(evening, ['20:00', '21:00', '22:00'])
    if (!result.ok) throw new Error(result.reason)
    expect(result.model.hours.map((h) => h.time)).toEqual(['20:00', '21:00', '22:00'])
    expect(result.model.hiddenHours).toBe(0)
  })

  it('respeta el orden operativo y no el del pedido', () => {
    const late = [court('A', [slot('22:00'), slot('23:00'), slot('00:00')])]
    const result = buildOnly(late, ['00:00', '22:00'])
    if (!result.ok) throw new Error(result.reason)
    expect(result.model.hours.map((h) => h.time)).toEqual(['22:00', '00:00'])
  })

  it('ignora las elegidas que ya no están libres y avisa si no queda ninguna', () => {
    const mixed = [court('A', [slot('20:00', 'occupied'), slot('21:00')])]
    const some = buildOnly(mixed, ['20:00', '21:00'])
    if (!some.ok) throw new Error(some.reason)
    expect(some.model.hours.map((h) => h.time)).toEqual(['21:00'])
    expect(buildOnly(mixed, ['20:00'])).toEqual({ ok: false, reason: 'taken' })
  })

  it('freeHoursOf devuelve las horas libres en orden operativo', () => {
    expect(freeHoursOf(availability(evening)).map((h) => h.time)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '20:00',
      '21:00',
      '22:00',
    ])
  })
})

describe('buildStoryModel — cuándo no hay placa', () => {
  it('sin canchas online', () => {
    expect(build([])).toEqual({ ok: false, reason: 'no_courts' })
  })

  it('día cerrado: hay canchas pero ninguna tiene slots', () => {
    expect(build([court('A', []), court('B', [])])).toEqual({ ok: false, reason: 'closed' })
  })

  it('hoy ya pasaron todos los turnos', () => {
    const past = [slot('17:00', 'past'), slot('18:00', 'past')]
    expect(build([court('A', past)])).toEqual({ ok: false, reason: 'over' })
  })

  it('quedan turnos por venir pero ninguno libre', () => {
    const slots = [slot('17:00', 'past'), slot('18:00', 'occupied'), slot('19:00', 'held')]
    expect(build([court('A', slots)])).toEqual({ ok: false, reason: 'full' })
  })

  it('tiene un mensaje para cada motivo', () => {
    expect(Object.keys(STORY_FAILURE_MESSAGES).sort()).toEqual([
      'closed',
      'full',
      'no_courts',
      'over',
      'taken',
    ])
  })
})

describe('buildStoryModel — día', () => {
  const one = [court('A', [slot('17:00')])]

  it('hoy y mañana: la palabra del titular y el día de la semana', () => {
    expect(model(one)).toMatchObject({ dayWord: 'HOY', kicker: 'HOY · MARTES' })
    expect(model(one, { date: '2026-09-30' })).toMatchObject({
      dayWord: 'MAÑANA',
      kicker: 'MAÑANA · MIÉRCOLES',
    })
  })

  it('cualquier otro día: el titular usa el día de la semana y el kicker lleva la fecha', () => {
    expect(model(one, { date: '2026-10-03' })).toMatchObject({
      dayWord: 'SÁBADO',
      kicker: 'SÁBADO · 3 DE OCTUBRE',
    })
  })
})

describe('buildStoryModel — nombre del complejo', () => {
  const one = [court('A', [slot('17:00')])]
  const nameOf = (name: string) => model(one, { tenant: { name } }).tenantName

  it('respeta tildes y ñ', () => {
    expect(nameOf('Complejo Peñarol Ñandú')).toBe('Complejo Peñarol Ñandú')
  })

  it('saca emojis y alfabetos que las fuentes no tienen', () => {
    expect(nameOf('⚽ M10 Menotti 🔥')).toBe('M10 Menotti')
    expect(nameOf('Мяч M10')).toBe('M10')
  })

  it('compone tildes descompuestas en vez de perderlas', () => {
    expect(nameOf('Café Sánchez')).toBe('Café Sánchez')
  })

  it('un salto de línea o un tab entre palabras es un espacio, no las pega', () => {
    expect(nameOf('M10\nMenotti')).toBe('M10 Menotti')
    expect(nameOf('M10\t\tMenotti')).toBe('M10 Menotti')
  })

  it('cae al slug si no queda nada dibujable', () => {
    expect(nameOf('⚽🔥')).toBe('m10')
    expect(nameOf('   ')).toBe('m10')
  })

  it('recorta los nombres larguísimos con puntos suspensivos', () => {
    const long = nameOf('Complejo Deportivo '.repeat(10))
    expect(long).toHaveLength(64)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('buildStoryModel — llamado a reservar y URL', () => {
  const one = [court('A', [slot('17:00')])]

  it('con reserva online invita a reservar', () => {
    expect(model(one).cta).toBe('RESERVÁ TU CANCHA')
  })

  it('sin reserva online solo invita a mirar los horarios', () => {
    expect(model(one, { tenant: { allowOnlineBooking: false } }).cta).toBe('MIRÁ LOS HORARIOS')
  })

  it('la URL visible es la del portal, sin esquema ni barra final', () => {
    expect(model(one).portalHost).toBe('turnogol.app/m10')
    expect(model(one, { portalUrl: 'http://localhost:3000/m10/' }).portalHost).toBe(
      'localhost:3000/m10',
    )
  })

  it('el modelo no carga nada que la placa ya no dibuje (hora de generación, teléfono)', () => {
    expect(Object.keys(model(one)).sort()).toEqual(
      ['cta', 'dayWord', 'hiddenHours', 'hours', 'kicker', 'portalHost', 'tenantName'].sort(),
    )
  })
})
