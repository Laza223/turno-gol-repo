// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ParticipantMatchView } from '@/app/(player)/rival/partido/[id]/ParticipantMatchView'
import { PublicBoardView } from '@/app/(player)/rival/partido/[id]/PublicBoardView'
import type { RivalBoardItem, RivalMyMatch } from '@/modules/rival/rival.types'

afterEach(() => cleanup())

const NOW = new Date('2026-03-14T18:30:00Z')
const noop = vi.fn(async () => ({ success: true as const }))
const noopForm = vi.fn(async () => ({ success: true as const }))

const board = (o: Partial<RivalBoardItem> = {}): RivalBoardItem => ({
  id: 'm1',
  tenantId: 't1',
  tenantName: 'El Vagón',
  tenantSlug: 'el-vagon',
  startsAt: new Date('2026-03-15T00:00:00Z'),
  format: 5,
  capacity: 10,
  level: 'parejo',
  seeking: 'players',
  seekingPosition: 'any',
  confirmedCount: 7,
  hasStamp: false,
  ...o,
})

function renderPublic(o: Partial<RivalBoardItem>, signedIn: boolean) {
  render(
    <PublicBoardView
      match={board(o)}
      viewer={signedIn ? { kind: 'player', welcome: null } : { kind: 'anon' }}
      now={NOW}
      requestAction={noop}
      acceptAndRequestAction={noopForm}
      reportMatchAction={noop}
    />,
  )
}

describe('PublicBoardView: qué verde sale y para quién', () => {
  it('sin sesión es un link al login, y "Busca rival" dice igual "Pedir sumarme"', () => {
    renderPublic({}, false)
    expect(screen.getByRole('link', { name: 'Pedir sumarme' }).getAttribute('href')).toBe(
      '/ingresar?next=%2Frival%2Fpartido%2Fm1',
    )
    cleanup()
    renderPublic({ seeking: 'rival', seekingPosition: null }, false)
    expect(screen.getByRole('link', { name: 'Pedir sumarme' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Pedir el partido' })).toBeNull()
  })

  it('sin sesión no hay denuncia; con sesión, el pedido es un botón y se puede denunciar', () => {
    renderPublic({}, false)
    expect(screen.queryByRole('button', { name: 'Denunciar el partido' })).toBeNull()
    cleanup()
    renderPublic({}, true)
    expect(screen.getByRole('button', { name: 'Pedir sumarme' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Denunciar el partido' })).toBeTruthy()
  })

  it('el tipo aparte solo sale cuando dice algo distinto del contador', () => {
    renderPublic({ seekingPosition: 'goalkeeper' }, false)
    expect(screen.getByText('Se busca arquero')).toBeTruthy()
    cleanup()
    renderPublic({}, false)
    // "Faltan 3" aparece una sola vez (el titular de la grilla).
    expect(screen.getAllByText('Faltan 3')).toHaveLength(1)
  })
})

const mine = (o: Partial<RivalMyMatch> = {}): RivalMyMatch => ({
  ...board(),
  status: 'open',
  filledAt: null,
  courtDeclared: false,
  isOrganizer: false,
  onBoard: true,
  inviteCode: null,
  isHidden: false,
  participantId: 'me',
  myRole: 'player',
  myStatus: 'confirmed',
  myOrigin: 'board',
  ...o,
})

function renderParticipant(m: RivalMyMatch, contactLink: string | null) {
  render(
    <ParticipantMatchView
      match={m}
      roster={[]}
      contactLink={contactLink}
      now={NOW}
      leaveAction={noop}
      reportMatchAction={noop}
      reportPlayerAction={noop}
    />,
  )
}

const WA = 'https://wa.me/5491100000000?text=Hola'

describe('ParticipantMatchView: "Escribile por WhatsApp"', () => {
  it('solo para el confirmado que vino del tablón y con el link que dio el servidor', () => {
    renderParticipant(mine(), WA)
    expect(screen.getByRole('link', { name: 'Escribile por WhatsApp' }).getAttribute('href')).toBe(
      WA,
    )
    expect(screen.getByText('Al escribirle, va a ver tu número.')).toBeTruthy()
  })

  it.each([
    ['vino por el link', mine({ myOrigin: 'invite' }), WA],
    ['sigue en pedido', mine({ myStatus: 'requested' }), WA],
    ['está en el banco', mine({ myStatus: 'bench' }), WA],
    ['el servidor no dio link', mine(), null],
    ['el partido se cayó', mine({ status: 'canceled' }), WA],
    ['el partido ya se jugó', mine({ startsAt: new Date('2026-03-13T00:00:00Z') }), WA],
  ])('no sale si %s', (_caso, m, link) => {
    renderParticipant(m, link)
    expect(screen.queryByRole('link', { name: 'Escribile por WhatsApp' })).toBeNull()
  })

  it('el pedido pendiente se puede bajar; rechazado, bajado o sacado no', () => {
    renderParticipant(mine({ myStatus: 'requested' }), null)
    expect(screen.getByRole('button', { name: 'Me bajo' })).toBeTruthy()
    for (const myStatus of ['declined', 'left', 'removed'] as const) {
      cleanup()
      renderParticipant(mine({ myStatus }), null)
      expect(screen.queryByRole('button', { name: 'Me bajo' })).toBeNull()
    }
  })
})
