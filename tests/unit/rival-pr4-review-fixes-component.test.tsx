// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LeaveMatch } from '@/app/(player)/rival/p/[code]/LeaveMatch'
import { myStatusLine } from '@/app/(player)/rival/p/[code]/People'
import { PublishToBoard } from '@/app/(player)/rival/p/[code]/PublishToBoard'
import { ReportMatchButton, ReportPlayerButton } from '@/app/(player)/rival/p/[code]/ReportButton'
import { ParticipantMatchView } from '@/app/(player)/rival/partido/[id]/ParticipantMatchView'
import type { RivalMyMatch } from '@/modules/rival/rival.types'

afterEach(cleanup)

const ok = vi.fn(async () => ({ success: true as const }))
const HINT = 'Si no podés ir, bajate a tiempo: alguien del banco ocupa tu lugar.'
const NOT_EXISTS = 'El partido no existe'

describe('LeaveMatch: el texto del banco', () => {
  it('con showHint=false (pedido sin aceptar) no lo muestra; por defecto sí', () => {
    render(<LeaveMatch matchId="m1" leaveAction={ok} showHint={false} />)
    expect(screen.queryByText(HINT)).toBeNull()
    expect(screen.getByRole('button', { name: 'Me bajo' })).toBeTruthy()
    cleanup()
    render(<LeaveMatch matchId="m1" leaveAction={ok} />)
    expect(screen.getByText(HINT)).toBeTruthy()
  })
})

describe('denunciar: motivos', () => {
  it('a una persona no ofrece "El partido no existe"; al partido sí', async () => {
    render(<ReportPlayerButton matchId="m1" playerId="p1" reportAction={ok} />)
    fireEvent.click(screen.getByRole('button', { name: 'Denunciar' }))
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
  it('si no se puede (cupo distinto del formato o capitán confirmado) queda solo "Buscamos jugadores"', () => {
    open(false)
    expect(screen.getByText('Buscamos jugadores')).toBeTruthy()
    expect(screen.queryByText('Buscamos rival')).toBeNull()
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
  it('"Me bajo" en un pedido no trae el texto del banco; confirmado y banco sí', () => {
    view(match({ myStatus: 'requested' }))
    expect(screen.getByRole('button', { name: 'Me bajo' })).toBeTruthy()
    expect(screen.queryByText(HINT)).toBeNull()
    for (const myStatus of ['confirmed', 'bench'] as const) {
      cleanup()
      view(match({ myStatus }))
      expect(screen.getByText(HINT), myStatus).toBeTruthy()
    }
  })
})
