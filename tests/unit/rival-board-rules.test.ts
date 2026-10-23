import { describe, expect, it } from 'vitest'
import { encodeBoardCursor, parseBoardCursor } from '@/app/(player)/rival/board-cursor'
import { canAcceptRequest, canSeekRival } from '@/app/(player)/rival/p/[code]/organizer-rules'

const ID = '11111111-1111-4111-8111-111111111111'

describe('canAcceptRequest', () => {
  const open = { capacity: 10, confirmedCount: 7 }
  const full = { capacity: 10, confirmedCount: 10 }

  it('un jugador se acepta mientras haya lugar y no cuando está lleno', () => {
    expect(canAcceptRequest({ role: 'player' }, open, [])).toBe(true)
    expect(canAcceptRequest({ role: 'player' }, full, [])).toBe(false)
  })

  it('el capitán rival no cuenta para el cupo: se acepta con el partido lleno', () => {
    expect(canAcceptRequest({ role: 'rival_captain' }, full, [])).toBe(true)
  })

  it('con un capitán ya confirmado no se acepta otro (aunque haya lugar)', () => {
    const roster = [{ role: 'rival_captain' as const, status: 'confirmed' as const }]
    expect(canAcceptRequest({ role: 'rival_captain' }, open, roster)).toBe(false)
  })

  it('un capitán que solo pidió o se bajó no bloquea al siguiente', () => {
    const roster = [
      { role: 'rival_captain' as const, status: 'requested' as const },
      { role: 'rival_captain' as const, status: 'left' as const },
    ]
    expect(canAcceptRequest({ role: 'rival_captain' }, open, roster)).toBe(true)
  })
})

describe('canSeekRival', () => {
  it('solo con el cupo igual al formato', () => {
    expect(canSeekRival({ capacity: 5, format: 5 }, [])).toBe(true)
    expect(canSeekRival({ capacity: 10, format: 5 }, [])).toBe(false)
  })

  it('no con un capitán rival ya confirmado; uno que solo pidió no bloquea', () => {
    const confirmed = [{ role: 'rival_captain' as const, status: 'confirmed' as const }]
    const requested = [{ role: 'rival_captain' as const, status: 'requested' as const }]
    expect(canSeekRival({ capacity: 5, format: 5 }, confirmed)).toBe(false)
    expect(canSeekRival({ capacity: 5, format: 5 }, requested)).toBe(true)
  })
})

describe('cursor del tablón (?despues=)', () => {
  it('ida y vuelta', () => {
    const cursor = { startsAt: new Date('2026-03-14T23:00:00.000Z'), id: ID }
    expect(parseBoardCursor(encodeBoardCursor(cursor))).toEqual(cursor)
  })

  it.each([
    undefined,
    '',
    'basura',
    `${ID}`,
    `no-es-fecha_${ID}`,
    '2026-03-14_' + ID,
    '2026-03-14T23:00:00.000Z_no-es-uuid',
    '2026-13-45T99:00:00.000Z_' + ID,
  ])('un cursor inválido (%s) se ignora', (raw) => {
    expect(parseBoardCursor(raw)).toBeNull()
  })
})
