// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LeaveMatch } from '@/app/(player)/rival/p/[code]/LeaveMatch'
import { myStatusLine } from '@/app/(player)/rival/p/[code]/People'
import { OrganizerActions } from '@/app/(player)/rival/p/[code]/OrganizerActions'
import { PublishToBoard } from '@/app/(player)/rival/p/[code]/PublishToBoard'
import { ReportMatchButton, ReportPlayerButton } from '@/app/(player)/rival/p/[code]/ReportButton'
import { ParticipantMatchView } from '@/app/(player)/rival/partido/[id]/ParticipantMatchView'
import type { RivalMyMatch } from '@/modules/rival/rival.types'

afterEach(cleanup)

const ok = vi.fn(async () => ({ success: true as const }))
const NOT_EXISTS = 'El partido no existe'

describe('LeaveMatch: el efecto se dice una vez', () => {
  it('no repite en la pantalla el texto del banco: vive en el diálogo', () => {
    render(<LeaveMatch matchId="m1" leaveAction={ok} />)
    expect(screen.getByRole('button', { name: 'Me bajo' })).toBeTruthy()
    expect(screen.queryByText(/alguien del banco ocupa tu lugar/)).toBeNull()
  })
})

describe('denunciar: motivos', () => {
  it('a una persona no ofrece "El partido no existe"; al partido sí', async () => {
    render(<ReportPlayerButton matchId="m1" playerId="p1" name="Ana P." reportAction={ok} />)
    // Ícono solo, pero con nombre accesible que dice a quién.
    fireEvent.click(screen.getByRole('button', { name: 'Denunciar a Ana P.' }))
    expect(await screen.findByText('Es spam o publicidad')).toBeTruthy()
    expect(screen.queryByText(NOT_EXISTS)).toBeNull()
    cleanup()
    render(<ReportMatchButton matchId="m1" reportAction={ok} />)
    fireEvent.click(screen.getByRole('button', { name: 'Denunciar el partido' }))
    expect(await screen.findByText(NOT_EXISTS)).toBeTruthy()
  })
})

describe('PublishToBoard: "Buscamos rival" solo si se puede', () => {
  function open(canSeekRival: boolean) {
    render(
      <PublishToBoard
        matchId="m1"
        boardLabel={null}
        whatsappPrefill={null}
        canSeekRival={canSeekRival}
        publishAction={async () => ({ success: true })}
        unpublishAction={ok}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Publicar en el tablón' }))
  }
  it('con cupo = formato y sin capitán rival aparece junto a "Buscamos jugadores"', () => {
    open(true)
    expect(screen.getByText('Buscamos jugadores')).toBeTruthy()
    expect(screen.getByText('Buscamos rival')).toBeTruthy()
  })
  it('si no se puede (cupo distinto del formato o capitán confirmado) no pregunta qué busca', () => {
    open(false)
    expect(screen.queryByText('Buscamos jugadores')).toBeNull()
    expect(screen.queryByText('Buscamos rival')).toBeNull()
    expect(screen.getByText('Aparece en el tablón y cualquiera puede pedir sumarse.')).toBeTruthy()
    expect(screen.getByText('Cualquier posición')).toBeTruthy()
    expect(screen.getByText('Un arquero')).toBeTruthy()
  })
  it('no existe "Apagado" y ofrece guardar el número solo si es uno nuevo', () => {
    open(true)
    expect(screen.queryByText('Apagado')).toBeNull()
    expect(screen.queryByLabelText('Guardar este número en mi cuenta')).toBeNull()
    fireEvent.change(screen.getByLabelText('Tu WhatsApp'), { target: { value: '11 5555 1234' } })
    expect(screen.getByLabelText('Guardar este número en mi cuenta')).toBeTruthy()
  })
  it('recién armado "busca rival" (primary): publica sin preguntar qué busca', () => {
    render(
      <PublishToBoard
        matchId="m1"
        boardLabel={null}
        whatsappPrefill={null}
        canSeekRival
        primary
        publishAction={async () => ({ success: true })}
        unpublishAction={ok}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Publicar en el tablón' }))
    expect(screen.queryByText('Buscamos jugadores')).toBeNull()
    expect(screen.getByText('Aparece en el tablón como "Busca rival".')).toBeTruthy()
    expect(screen.queryByText('Cualquier posición')).toBeNull()
  })
})

describe('PublishToBoard: un corte de red no rompe la vista', () => {
  const OFFLINE = 'No pudimos conectar. Revisá tu conexión y probá de nuevo.'
  const down = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  })

  it('publicar: muestra el error y conserva el WhatsApp tipeado', async () => {
    render(
      <PublishToBoard
        matchId="m1"
        boardLabel={null}
        whatsappPrefill={null}
        canSeekRival
        publishAction={down}
        unpublishAction={ok}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Publicar en el tablón' }))
    fireEvent.change(screen.getByLabelText('Tu WhatsApp'), { target: { value: '11 5555 1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(OFFLINE)
    expect((screen.getByLabelText('Tu WhatsApp') as HTMLInputElement).value).toBe('11 5555 1234')
  })

  it('sacar del tablón: muestra el error en lugar de caer al boundary', async () => {
    render(
      <PublishToBoard
        matchId="m1"
        boardLabel="Buscamos jugadores"
        whatsappPrefill={null}
        canSeekRival
        publishAction={async () => ({ success: true })}
        unpublishAction={down}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sacar del tablón' }))
    expect((await screen.findByRole('alert')).textContent).toBe(OFFLINE)
  })
})

describe('copy del pedido: una sola fuente', () => {
  const PEDIDO = 'Pedido enviado. Te avisamos por mail si te aceptan.'
  const match = (o: Partial<RivalMyMatch>): RivalMyMatch => ({
    id: 'm1',
    tenantId: 't1',
    tenantName: 'El Vagón',
    tenantSlug: 'el-vagon',
    startsAt: new Date('2099-03-15T00:00:00Z'),
    format: 5,
    capacity: 10,
    level: 'parejo',
    status: 'open',
    seeking: 'players',
    seekingPosition: 'any',
    confirmedCount: 7,
    filledAt: null,
    courtDeclared: false,
    hasStamp: true,
    isOrganizer: false,
    onBoard: true,
    inviteCode: null,
    isHidden: false,
    participantId: 'me',
    myRole: 'player',
    myStatus: 'requested',
    myOrigin: 'board',
    ...o,
  })
  function view(m: RivalMyMatch) {
    render(
      <ParticipantMatchView
        match={m}
        roster={[]}
        contactLink={null}
        now={new Date('2026-03-14T18:30:00Z')}
        leaveAction={ok}
        reportMatchAction={ok}
        reportPlayerAction={ok}
      />,
    )
  }

  it('myStatusLine y la vista del participante dicen lo mismo en "requested"', () => {
    expect(myStatusLine('requested')).toBe(PEDIDO)
    view(match({}))
    expect(screen.getByText(PEDIDO)).toBeTruthy()
  })
  it('retirarse está en pedido, confirmado y banco; el pedido dice "Cancelar pedido"', () => {
    for (const myStatus of ['requested', 'confirmed', 'bench'] as const) {
      cleanup()
      view(match({ myStatus }))
      const name = myStatus === 'requested' ? 'Cancelar pedido' : 'Me bajo'
      expect(screen.getByRole('button', { name }), myStatus).toBeTruthy()
      expect(screen.queryByText(/alguien del banco ocupa tu lugar/), myStatus).toBeNull()
    }
  })
})

describe('PublishToBoard: foco y jerarquía', () => {
  function renderActions() {
    render(
      <OrganizerActions
        matchId="m1"
        shareUrl="https://x/p/abc"
        shareHref="https://wa.me/?text=hola"
        boardLabel={null}
        whatsappPrefill={null}
        canSeekRival={false}
        cancelAction={ok}
        publishAction={async () => ({ success: true })}
        unpublishAction={ok}
      />,
    )
  }
  it('al abrir lleva el foco al título; al cerrar con "Ahora no" lo devuelve al botón', () => {
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Publicar en el tablón' }))
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Publicar en el tablón' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Publicar en el tablón' }),
    )
  })
  it('con el form abierto "Publicar" es el verde y "Avisar al grupo" baja a secundaria', () => {
    renderActions()
    const share = screen.getByRole('link', { name: /Avisar al grupo/ })
    expect(share.className).toContain('bg-primary')
    fireEvent.click(screen.getByRole('button', { name: 'Publicar en el tablón' }))
    expect(screen.getByRole('link', { name: /Avisar al grupo/ }).className).not.toContain(
      'bg-primary',
    )
    expect(screen.getByRole('button', { name: 'Publicar' }).className).toContain('bg-primary')
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(screen.getByRole('link', { name: /Avisar al grupo/ }).className).toContain('bg-primary')
  })
  it('publicar con éxito (la page trae boardLabel) devuelve el verde a "Avisar al grupo"', () => {
    const props = {
      matchId: 'm1',
      shareUrl: 'https://x/p/abc',
      shareHref: 'https://wa.me/?text=hola',
      whatsappPrefill: null,
      canSeekRival: false,
      cancelAction: ok,
      publishAction: async () => ({ success: true as const }),
      unpublishAction: ok,
    }
    const { rerender } = render(<OrganizerActions {...props} boardLabel={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Publicar en el tablón' }))
    expect(screen.getByRole('link', { name: /Avisar al grupo/ }).className).not.toContain(
      'bg-primary',
    )
    rerender(<OrganizerActions {...props} boardLabel="Faltan 3" />)
    expect(screen.getByRole('link', { name: /Avisar al grupo/ }).className).toContain('bg-primary')
    rerender(<OrganizerActions {...props} boardLabel={null} />)
    expect(screen.getByRole('link', { name: /Avisar al grupo/ }).className).toContain('bg-primary')
  })
})
