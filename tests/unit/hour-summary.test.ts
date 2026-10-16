import { describe, expect, it } from 'vitest'
import type { AvailabilityResponse } from '@/modules/tenants/public.service'
import { summarizeHours } from '@/lib/booking/hour-summary'
import { slot, type SlotFixture } from '@/test/fixtures/public'

type Court = AvailabilityResponse['courts'][number]

function court(id: string, format: number, slots: SlotFixture[]): Court {
  return {
    id,
    name: `Cancha ${id}`,
    surfaceType: 'synthetic_grass',
    isCovered: false,
    hasLighting: true,
    format,
    slots,
  }
}

const free = (time: string, price: number | null = 1_500_000) =>
  slot({ time, status: 'free', price })
const taken = (time: string) => slot({ time, status: 'occupied' })
const held = (time: string) => slot({ time, status: 'held', heldUntil: '2026-03-14T19:00:00.000Z' })
const past = (time: string) => slot({ time, status: 'past' })

const states = (rows: ReturnType<typeof summarizeHours>) => rows.map((r) => [r.time, r.state])

describe('summarizeHours — orden', () => {
  it('conserva el orden del servidor: la madrugada de closes_next_day queda después de las 23:00', () => {
    const rows = summarizeHours([court('1', 5, [free('22:00'), free('23:00'), free('00:00')])])
    expect(rows.map((r) => r.time)).toEqual(['22:00', '23:00', '00:00'])
  })

  it('toma el orden de la primera cancha que trae la hora, no de la etiqueta', () => {
    const rows = summarizeHours([
      court('1', 5, [free('23:00'), free('00:00')]),
      court('2', 5, [free('23:00'), free('00:00')]),
    ])
    expect(rows.map((r) => r.time)).toEqual(['23:00', '00:00'])
  })
})

describe('summarizeHours — estados', () => {
  it('free con 2 o más libres, last con 1, held si no queda ninguna pero alguien está señando, full si no', () => {
    const rows = summarizeHours([
      court('1', 5, [free('18:00'), free('19:00'), held('20:00'), taken('21:00')]),
      court('2', 5, [free('18:00'), taken('19:00'), taken('20:00'), taken('21:00')]),
    ])
    expect(states(rows)).toEqual([
      ['18:00', 'free'],
      ['19:00', 'last'],
      ['20:00', 'held'],
      ['21:00', 'full'],
    ])
    expect(rows.map((r) => r.freeCount)).toEqual([2, 1, 0, 0])
  })

  it('una libre y otra señando cuenta como last: el lugar libre manda', () => {
    const rows = summarizeHours([court('1', 5, [free('18:00')]), court('2', 5, [held('18:00')])])
    expect(states(rows)).toEqual([['18:00', 'last']])
  })

  it('lista las canchas libres de esa hora, con formato y precio tal como vienen del slot', () => {
    const rows = summarizeHours([
      court('1', 5, [free('18:00', 1_200_000)]),
      court('2', 7, [taken('18:00')]),
      court('3', 7, [free('18:00', null)]),
    ])
    expect(rows[0]!.courts).toEqual([
      { id: '1', name: 'Cancha 1', format: 5, price: 1_200_000 },
      { id: '3', name: 'Cancha 3', format: 7, price: null },
    ])
  })
})

describe('summarizeHours — horas pasadas', () => {
  it('oculta la fila donde todas las canchas están past', () => {
    const rows = summarizeHours([
      court('1', 5, [past('10:00'), past('11:00'), free('12:00')]),
      court('2', 5, [past('10:00'), past('11:00'), taken('12:00')]),
    ])
    expect(states(rows)).toEqual([['12:00', 'last']])
  })

  it('un día entero pasado no deja filas', () => {
    expect(summarizeHours([court('1', 5, [past('10:00'), past('11:00')])])).toEqual([])
  })

  it('un día sin slots (cerrado) no deja filas', () => {
    expect(summarizeHours([court('1', 5, [])])).toEqual([])
    expect(summarizeHours([])).toEqual([])
  })
})

describe('summarizeHours — filtro por formato', () => {
  const day = [
    court('1', 5, [free('18:00'), free('19:00')]),
    court('2', 5, [free('18:00'), taken('19:00')]),
    court('3', 7, [taken('18:00'), free('19:00')]),
  ]

  it('sin filtro cuenta todas las canchas', () => {
    expect(summarizeHours(day).map((r) => r.freeCount)).toEqual([2, 2])
  })

  it('con formato cuenta y lista solo las de ese formato', () => {
    const f5 = summarizeHours(day, 5)
    expect(states(f5)).toEqual([
      ['18:00', 'free'],
      ['19:00', 'last'],
    ])
    expect(f5.flatMap((r) => r.courts.map((c) => c.format))).toEqual([5, 5, 5])

    // Una sola cancha de fútbol 7: su hora libre es `only`, no `last` (no hay otra de la que "quedar").
    const f7 = summarizeHours(day, 7)
    expect(states(f7)).toEqual([
      ['18:00', 'full'],
      ['19:00', 'only'],
    ])
  })

  it('un formato que el complejo no tiene no deja filas', () => {
    expect(summarizeHours(day, 9)).toEqual([])
  })

  it('una hora pasada solo en las canchas del formato elegido desaparece con ese filtro', () => {
    const rows = summarizeHours(
      [
        court('1', 5, [past('09:00'), free('10:00')]),
        court('2', 7, [free('09:00'), free('10:00')]),
      ],
      5,
    )
    expect(rows.map((r) => r.time)).toEqual(['10:00'])
  })
})

describe('summarizeHours — cantidad de canchas', () => {
  it('1 cancha: la única libre es only (no es escasez: es la que hay)', () => {
    expect(states(summarizeHours([court('1', 5, [free('18:00')])]))).toEqual([['18:00', 'only']])
  })

  it('1 cancha ocupada o señada sigue siendo full / held', () => {
    const rows = summarizeHours([court('1', 5, [taken('18:00'), held('19:00')])])
    expect(states(rows)).toEqual([
      ['18:00', 'full'],
      ['19:00', 'held'],
    ])
  })

  it('el filtro de formato que deja una sola cancha también es only; con 2 sigue siendo last', () => {
    const two = [
      court('1', 5, [free('20:00')]),
      court('2', 5, [free('20:00')]),
      court('3', 7, [free('20:00')]),
    ]
    expect(states(summarizeHours(two, 7))).toEqual([['20:00', 'only']])
    const lastOfFive = [court('1', 5, [free('20:00')]), court('2', 5, [taken('20:00')])]
    expect(states(summarizeHours(lastOfFive, 5))).toEqual([['20:00', 'last']])
  })

  it('16 canchas: cuenta las 16 y las lista en el orden del servidor', () => {
    const many = Array.from({ length: 16 }, (_, i) =>
      court(String(i + 1), 4 + (i % 8), [free('21:00')]),
    )
    const [row] = summarizeHours(many)
    expect(row).toMatchObject({ time: '21:00', freeCount: 16, state: 'free' })
    expect(row!.courts.map((c) => c.id)).toEqual(many.map((c) => c.id))
  })
})
