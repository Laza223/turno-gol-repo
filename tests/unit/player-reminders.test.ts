import { describe, expect, it } from 'vitest'
import { reminderKindFor, reminderTitle } from '@/shared/jobs/workers/player-reminders.worker'

const H = 3_600_000
const TZ = 'America/Argentina/Buenos_Aires'
// 2026-11-20 20:00 ART = 23:00 UTC
const start = new Date('2026-11-20T23:00:00Z')
const at = (hoursBefore: number) => new Date(start.getTime() - hoursBefore * H)
const createdLongAgo = at(72)

describe('reminderKindFor', () => {
  it('24 h antes manda el de 24 h', () => {
    expect(reminderKindFor(start, createdLongAgo, at(24))).toBe('24h')
    expect(reminderKindFor(start, createdLongAgo, at(10))).toBe('24h')
  })
  it('2 h antes manda el de 2 h, aunque el de 24 h se haya perdido', () => {
    expect(reminderKindFor(start, createdLongAgo, at(2))).toBe('2h')
    expect(reminderKindFor(start, createdLongAgo, at(0.5))).toBe('2h')
  })
  it('el de 24 h perdido no llega pegado al de 2 h', () => {
    expect(reminderKindFor(start, createdLongAgo, at(4.1))).toBe('24h')
    expect(reminderKindFor(start, createdLongAgo, at(3))).toBeNull()
  })
  it('fuera de la ventana o ya empezado no manda nada', () => {
    expect(reminderKindFor(start, createdLongAgo, at(25))).toBeNull()
    expect(reminderKindFor(start, createdLongAgo, at(0))).toBeNull()
    expect(reminderKindFor(start, createdLongAgo, at(-1))).toBeNull()
  })
  it('un turno sacado con menos anticipación que el aviso no lo recibe', () => {
    expect(reminderKindFor(start, at(10), at(8))).toBeNull()
    expect(reminderKindFor(start, at(10), at(1))).toBe('2h')
    expect(reminderKindFor(start, at(1), at(0.5))).toBeNull()
  })
})

describe('reminderTitle', () => {
  it('dice mañana o hoy según el calendario del complejo', () => {
    expect(reminderTitle(start, at(24), TZ)).toBe('Mañana jugás a las 20:00')
    expect(reminderTitle(start, at(2), TZ)).toBe('Hoy jugás a las 20:00')
  })
  it('un turno de pasada la medianoche se lee en la hora local', () => {
    const late = new Date('2026-11-21T03:30:00Z') // 00:30 ART del 21
    expect(reminderTitle(late, new Date('2026-11-21T02:00:00Z'), TZ)).toBe(
      'Mañana jugás a las 00:30',
    )
  })
})
