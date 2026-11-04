import { describe, expect, it } from 'vitest'
import { deriveMatchView } from '@/app/(player)/rival/p/[code]/match-view-state'
import type { RivalPublicMatch } from '@/modules/rival/rival.types'

const match = (o: Partial<RivalPublicMatch> = {}): RivalPublicMatch => ({
  id: 'm1',
  tenantId: 't1',
  tenantName: 'El Vagón',
  tenantSlug: 'el-vagon',
  tenantCity: 'Luján',
  startsAt: new Date('2026-03-15T00:00:00Z'),
  format: 5,
  capacity: 10,
  level: 'parejo',
  status: 'open',
  seeking: null,
  seekingPosition: null,
  confirmedCount: 1,
  filledAt: null,
  courtDeclared: false,
  hasStamp: false,
  isOrganizer: true,
  ...o,
})

const created = (seeking: RivalPublicMatch['seeking']) =>
  deriveMatchView({
    match: match({ seeking }),
    roster: [],
    now: new Date('2026-03-01T00:00:00Z'),
    justCreated: true,
  }).created

describe('deriveMatchView: aviso de recién armado', () => {
  it('busca jugadores: ya está en el tablón y el grupo confirma con un toque', () => {
    expect(created('players')).toEqual({
      title: 'Ya está en el tablón',
      line: 'Pasale el link al grupo: los que vengan con vos confirman con un toque.',
    })
  })
  it('busca rival: ya está en el tablón y el pedido llega por mail', () => {
    expect(created('rival')).toEqual({
      title: 'Ya está en el tablón',
      line: 'Mientras tanto, pasale el link a tu equipo.',
    })
  })
  it('solo el grupo: partido armado', () => {
    expect(created(null)).toEqual({
      title: 'Partido armado',
      line: 'Pasale el link al grupo: cada uno confirma con un toque.',
    })
  })
  it('no hay más un paso "publicar" que reemplace al de avisar al grupo', () => {
    const view = deriveMatchView({
      match: match(),
      roster: [],
      now: new Date('2026-03-01T00:00:00Z'),
      justCreated: true,
    })
    expect('primary' in view).toBe(false)
  })
})
