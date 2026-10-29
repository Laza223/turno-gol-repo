import { describe, expect, it } from 'vitest'
import { groupBoardByDay } from '@/modules/rival/rival-display'

const at = (iso: string, id: string) => ({ id, startsAt: new Date(iso) })

describe('groupBoardByDay: Hoy / Mañana / Próximos días, en ART', () => {
  // Jueves 2026-10-22, 12:00 ART.
  const now = new Date('2026-10-22T15:00:00Z')

  it('agrupa por día ART y ordena por hora dentro del grupo', () => {
    const groups = groupBoardByDay(
      [
        at('2026-10-22T23:00:00Z', 'noche'), // hoy 20:00
        at('2026-10-22T20:00:00Z', 'tarde'), // hoy 17:00
        at('2026-10-23T22:00:00Z', 'manana'), // mañana 19:00
        at('2026-10-27T22:00:00Z', 'semana'), // martes 19:00
      ],
      now,
    )
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ['today', 'Hoy', ['tarde', 'noche']],
      ['tomorrow', 'Mañana', ['manana']],
      ['week', 'Próximos días', ['semana']],
    ])
  })

  it('no muestra grupos vacíos', () => {
    const groups = groupBoardByDay([at('2026-10-25T22:00:00Z', 'a')], now)
    expect(groups.map((g) => g.key)).toEqual(['week'])
  })

  it('de 21:00 a 23:59 ART sigue siendo hoy: el día no se deriva en UTC', () => {
    // 22:00 ART del jueves = 01:00 UTC del viernes.
    const lateNow = new Date('2026-10-23T01:00:00Z')
    const groups = groupBoardByDay(
      [
        at('2026-10-23T02:30:00Z', 'hoy-23-30'), // jueves 23:30 ART (viernes en UTC)
        at('2026-10-23T03:00:00Z', 'manana-00'), // viernes 00:00 ART
      ],
      lateNow,
    )
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['today', ['hoy-23-30']],
      ['tomorrow', ['manana-00']],
    ])
  })
})
