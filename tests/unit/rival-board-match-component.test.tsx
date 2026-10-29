// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RivalFormResult } from '@/app/(player)/rival/actions'
import { ParticipantMatchView } from '@/app/(player)/rival/partido/[id]/ParticipantMatchView'
import {
  PublicBoardView,
  type BoardViewer,
} from '@/app/(player)/rival/partido/[id]/PublicBoardView'
import type { RivalBoardItem, RivalMyMatch } from '@/modules/rival/rival.types'

// El ingreso del anónimo y el aviso de la bienvenida leen la ruta (como en la app).
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/rival/partido/m1',
  useSearchParams: () => new URLSearchParams(),
}))

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

const idle = vi.fn(async () => ({ status: 'idle' as const }))

function renderPublic(o: Partial<RivalBoardItem>, viewer: BoardViewer, acceptAction = noopForm) {
  render(
    <PublicBoardView
      match={board(o)}
      viewer={viewer}
      now={NOW}
      requestAction={noop}
      acceptAndRequestAction={acceptAction}
      reportMatchAction={noop}
      sendMagicLink={idle}
      startGoogle={idle}
    />,
  )
}

const ANON: BoardViewer = { kind: 'anon' }
const READY: BoardViewer = { kind: 'player', welcome: null }
const withNeeds = (needs: {
  identity: boolean
  profile: boolean
  position: boolean
}): BoardViewer => ({
  kind: 'player',
  welcome: { firstName: 'Lazaro', position: null, zone: null, needs },
})

describe('PublicBoardView: qué verde sale y para quién', () => {
  it('sin sesión es un botón en la barra fija que abre el ingreso RIVAL de "pedir"', async () => {
    renderPublic({}, ANON)
    const pedir = screen.getByRole('button', { name: 'Pedir sumarme' })
    expect(pedir.closest('[data-fixed-cta]')).not.toBeNull()
    expect(pedir.getAttribute('aria-haspopup')).toBe('dialog')
    expect(screen.queryByRole('link', { name: 'Pedir sumarme' })).toBeNull()
    fireEvent.click(pedir)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Entrá para pedir tu lugar')
    // Vuelve a este partido y no se envía solo: pedir sigue pidiendo el toque.
    expect(dialog.querySelector('input[name="next"]')?.getAttribute('value')).toBe(
      '/rival/partido/m1',
    )
    expect(idle).not.toHaveBeenCalled()
  })

  it('"Busca rival": el botón dice que pide el capitán del otro equipo y no hay "Se juega"', () => {
    renderPublic({ seeking: 'rival', seekingPosition: null, capacity: 5, confirmedCount: 5 }, ANON)
    expect(screen.getByRole('button', { name: 'Pedir jugar con mi equipo' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pedir sumarme' })).toBeNull()
    // Un solo titular: "Busca rival" (el equipo completo todavía no tiene rival).
    expect(screen.getAllByText('Busca rival')).toHaveLength(1)
    expect(screen.queryByText(/Se juega/)).toBeNull()
    expect(screen.getByText('5 de 5 confirmados')).toBeTruthy()
  })

  it('"Busca rival": el ingreso y la tarjeta nombran lo mismo que el botón, no "tu lugar"', async () => {
    renderPublic({ seeking: 'rival', seekingPosition: null, capacity: 5, confirmedCount: 5 }, ANON)
    fireEvent.click(screen.getByRole('button', { name: 'Pedir jugar con mi equipo' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Entrá para pedir jugar con tu equipo')
    expect(dialog.textContent).not.toContain('tu lugar')
    cleanup()
    renderPublic(
      { seeking: 'rival', seekingPosition: null, capacity: 5, confirmedCount: 5 },
      withNeeds({ identity: true, profile: true, position: true }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pedir jugar con mi equipo' }))
    expect(screen.getByText('Para pedir jugar con tu equipo, contanos quién sos.')).toBeTruthy()
  })

  it('un partido de jugadores completo sigue diciendo "Se juega"', () => {
    renderPublic({ capacity: 10, confirmedCount: 10 }, ANON)
    expect(screen.getByText('¡Estamos los 10! Se juega.')).toBeTruthy()
  })

  it('sin sesión no hay denuncia; con sesión, el pedido es un botón y se puede denunciar', () => {
    renderPublic({}, ANON)
    expect(screen.queryByRole('button', { name: 'Denunciar el partido' })).toBeNull()
    cleanup()
    renderPublic({}, READY)
    expect(screen.getByRole('button', { name: 'Pedir sumarme' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Denunciar el partido' })).toBeTruthy()
  })

  it('el tipo aparte solo sale cuando dice algo distinto del contador', () => {
    renderPublic({ seekingPosition: 'goalkeeper' }, ANON)
    expect(screen.getByText('Se busca arquero')).toBeTruthy()
    cleanup()
    renderPublic({}, ANON)
    // "Faltan 3" aparece una sola vez (el titular de la grilla).
    expect(screen.getAllByText('Faltan 3')).toHaveLength(1)
  })
})

describe('PublicBoardView: "Pedir sumarme" con sesión pide solo lo que falta', () => {
  it('perfil incompleto: la tarjeta pide posición y zona, no el nombre, y "Ahora no" la cierra', async () => {
    const action = vi.fn<(p: RivalFormResult, fd: FormData) => Promise<RivalFormResult>>(
      async () => ({ success: true }),
    )
    renderPublic({}, withNeeds({ identity: false, profile: true, position: true }), action)
    fireEvent.click(screen.getByRole('button', { name: 'Pedir sumarme' }))
    expect(screen.getByRole('heading', { name: 'Un dato más para sumarte' })).toBeTruthy()
    expect(screen.queryByLabelText('Tu nombre')).toBeNull()
    expect(screen.getByLabelText('Tu posición')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    // El botón se monta de nuevo: el foco vuelve a él, no al body.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pedir sumarme' }))
    expect(action).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Pedir sumarme' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pedir sumarme' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const sent = action.mock.calls[0]![1]
    expect([...sent.keys()].sort()).toEqual(['matchId', 'position', 'zone'])
    expect(sent.get('matchId')).toBe('m1')
  })

  it.each([
    [{ identity: true, profile: true, position: true }, 'Para pedir tu lugar, contanos quién sos.'],
    [
      { identity: true, profile: false, position: false },
      'Para pedir tu lugar, confirmá tu nombre y aceptá las reglas.',
    ],
  ])('%j: el intro de la tarjeta', (needs, intro) => {
    renderPublic({}, withNeeds(needs))
    fireEvent.click(screen.getByRole('button', { name: 'Pedir sumarme' }))
    expect(screen.getByText(intro)).toBeTruthy()
    expect(screen.getByLabelText('Tu nombre')).toBeTruthy()
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

  it('el pedido pendiente se puede cancelar; rechazado, bajado o sacado no', () => {
    renderParticipant(mine({ myStatus: 'requested' }), null)
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeTruthy()
    for (const myStatus of ['declined', 'left', 'removed'] as const) {
      cleanup()
      renderParticipant(mine({ myStatus }), null)
      expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull()
    }
  })
})
