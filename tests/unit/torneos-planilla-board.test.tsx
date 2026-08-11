// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

/**
 * La Planilla (B16).
 *
 * Lo que se prueba acá es el CONTRATO con `rescheduleMatchAction`: que el
 * payload sea el hueco elegido (cancha + instante ISO), que un rechazo del
 * servidor no saque al usuario del modo mover, y que ningún partido pueda
 * desaparecer del tablero. La legalidad de cada hueco se prueba aparte, sobre
 * el motor puro (`tournament-placement.test.ts`).
 */

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const toastMock = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}))

import { PlanillaBoard } from '@/app/(admin)/torneos/[id]/fixture/PlanillaBoard'
import type { TournamentMatchView, TournamentSlotRow } from '@/modules/tournaments/tournament.types'

const COURTS = [
  { id: 'court-1', name: 'Cancha 1' },
  { id: 'court-2', name: 'Cancha 2' },
]

/** 6 de marzo de 2027, en ART. */
function at(hour: number, minute = 0): Date {
  return new Date(
    `2027-03-06T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`,
  )
}

function slot(bookingId: string, courtId: string, hour: number): TournamentSlotRow {
  return {
    bookingId,
    courtId,
    date: '2027-03-06',
    timeStart: `${hour}:00`,
    timeEnd: `${hour + 1}:00`,
    startsAt: at(hour),
    endsAt: at(hour + 1),
  }
}

function match(overrides: Partial<TournamentMatchView> = {}): TournamentMatchView {
  return {
    id: 'match-1',
    tenantId: 't1',
    tournamentId: 'tour-1',
    stageId: 'stage-1',
    round: 1,
    groupLabel: null,
    bracketSlot: null,
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
    homeSourceMatchId: null,
    awaySourceMatchId: null,
    isThirdPlace: false,
    courtId: null,
    bookingId: null,
    startsAt: null,
    endsAt: null,
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    walkoverWinnerTeamId: null,
    homeSourceSeed: null,
    awaySourceSeed: null,
    playedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    homeTeamName: 'Los Pibes',
    awayTeamName: 'Rivales FC',
    courtName: null,
    ...overrides,
  }
}

const SLOTS = [slot('b1', 'court-1', 20), slot('b2', 'court-2', 20), slot('b3', 'court-1', 21)]

type Reschedule = React.ComponentProps<typeof PlanillaBoard>['rescheduleAction']

function renderBoard(
  props: Partial<React.ComponentProps<typeof PlanillaBoard>> = {},
  rescheduleAction: ReturnType<typeof vi.fn<Reschedule>> = vi.fn<Reschedule>(async () => ({
    success: true as const,
  })),
) {
  render(
    <PlanillaBoard
      tournamentId="tour-1"
      slots={SLOTS}
      matches={[]}
      courts={COURTS}
      matchDurationMinutes={60}
      restBetweenMatchesMinutes={0}
      rescheduleAction={rescheduleAction}
      {...props}
    />,
  )
  return rescheduleAction
}

/**
 * `ResponsiveList` deja las DOS vistas en el DOM (tabla para `sm+`, cards para
 * mobile) y solo esconde una por CSS, así que en happy-dom cada celda aparece
 * duplicada. Los conteos se hacen sobre la tabla, que es la que va primero en
 * el DOM — mismo criterio que los e2e de escritorio.
 */
function board() {
  return within(screen.getByRole('table'))
}

/** El aviso de "modo mover", que es el único `role="status"` del tablero. */
function movingBanner(): HTMLElement | null {
  return screen.queryByRole('status')
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(cleanup)

describe('PlanillaBoard — sin horas tomadas', () => {
  it('explica el modelo y lleva a tomar horarios en vez de mostrar un tablero vacío', () => {
    renderBoard({ slots: [] })
    expect(screen.getByText('El torneo todavía no tiene horas tomadas')).toBeTruthy()
    expect(screen.getByRole('link', { name: /tomar horarios/i })).toHaveAttribute(
      'href',
      '/torneos/tour-1',
    )
  })
})

describe('PlanillaBoard — mover un partido', () => {
  it('manda la cancha y el instante del hueco elegido', async () => {
    const sinAgendar = match({ id: 'm-libre' })
    const reschedule = renderBoard({ matches: [sinAgendar] })

    // Un partido sin hora se "ubica", no se "mueve".
    fireEvent.click(screen.getAllByRole('button', { name: /^Ubicar/ })[0]!)

    await waitFor(() => expect(movingBanner()).not.toBeNull())
    // 3 horas tomadas, ninguna ocupada.
    const targets = board().getAllByRole('button', { name: /mover el partido acá/i })
    expect(targets).toHaveLength(3)

    fireEvent.click(targets[0]!)

    await waitFor(() =>
      expect(reschedule).toHaveBeenCalledWith({
        matchId: 'm-libre',
        courtId: 'court-1',
        startsAt: at(20).toISOString(),
      }),
    )
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Partido movido' })),
    )
  })

  it('un partido que nunca estuvo agendado no ofrece "Deshacer"', async () => {
    const reschedule = renderBoard({ matches: [match({ id: 'm-libre' })] })

    fireEvent.click(screen.getAllByRole('button', { name: /^Ubicar/ })[0]!)
    await waitFor(() => expect(movingBanner()).not.toBeNull())
    fireEvent.click(board().getAllByRole('button', { name: /mover el partido acá/i })[0]!)

    await waitFor(() => expect(reschedule).toHaveBeenCalled())
    expect(toastMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ action: expect.anything() }),
    )
  })

  it('un partido que ya tenía lugar sí ofrece "Deshacer", y vuelve a donde estaba', async () => {
    const ubicado = match({
      id: 'm-ubicado',
      courtId: 'court-1',
      bookingId: 'b1',
      startsAt: at(20),
      endsAt: at(21),
      courtName: 'Cancha 1',
    })
    const reschedule = renderBoard({ matches: [ubicado] })

    fireEvent.click(screen.getAllByRole('button', { name: /^Mover Los Pibes/ })[0]!)
    await waitFor(() => expect(movingBanner()).not.toBeNull())
    // El hueco donde está queda como 'current', así que los destinos son 2.
    const targets = board().getAllByRole('button', { name: /mover el partido acá/i })
    expect(targets).toHaveLength(2)
    fireEvent.click(targets[0]!)

    await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1))

    const toastArg = toastMock.mock.calls.at(-1)![0] as {
      action?: { label: string; onClick: () => void }
    }
    expect(toastArg.action?.label).toBe('Deshacer')

    toastArg.action!.onClick()
    await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(2))
    expect(reschedule).toHaveBeenLastCalledWith({
      matchId: 'm-ubicado',
      courtId: 'court-1',
      startsAt: at(20).toISOString(),
    })
  })

  it('un rechazo del servidor se muestra y NO saca del modo mover', async () => {
    const reschedule = vi.fn<Reschedule>(async () => ({
      success: false as const,
      error: 'Esa cancha ya tiene otro partido a esa hora.',
    }))
    renderBoard({ matches: [match({ id: 'm-libre' })] }, reschedule)

    fireEvent.click(screen.getAllByRole('button', { name: /^Ubicar/ })[0]!)
    await waitFor(() => expect(movingBanner()).not.toBeNull())
    fireEvent.click(board().getAllByRole('button', { name: /mover el partido acá/i })[0]!)

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya tiene otro partido/i)
    // Sigue en modo mover: el aviso de arriba no se fue.
    expect(movingBanner()).not.toBeNull()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('Escape cancela el movimiento', async () => {
    renderBoard({ matches: [match({ id: 'm-libre' })] })

    fireEvent.click(screen.getAllByRole('button', { name: /^Ubicar/ })[0]!)
    await waitFor(() => expect(movingBanner()).not.toBeNull())

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(movingBanner()).toBeNull())
  })
})

describe('PlanillaBoard — ningún partido puede desaparecer', () => {
  it('el que quedó fuera de las horas del torneo se muestra en su propio riel', () => {
    // El torneo liberó la hora de las 23: el partido sigue agendado ahí y no
    // entra en ninguna celda del tablero.
    renderBoard({
      matches: [
        match({
          id: 'm-huerfano',
          courtId: 'court-1',
          startsAt: at(23),
          endsAt: at(24),
          homeTeamName: 'Huérfano FC',
          awayTeamName: 'Rivales FC',
        }),
      ],
    })

    expect(screen.getByText(/^Fuera de las horas del torneo/)).toBeTruthy()
    // El riel vive afuera de ResponsiveList: acá no hay vista duplicada.
    expect(screen.getByText('Huérfano FC vs Rivales FC')).toBeTruthy()
    expect(board().queryByText('Huérfano FC vs Rivales FC')).toBeNull()
  })

  it('un partido que pisa dos huecos se dibuja una sola vez', () => {
    renderBoard({
      matches: [
        match({
          id: 'm-corrido',
          courtId: 'court-1',
          // 20:30–21:30: pisa el hueco de las 20 y el de las 21.
          startsAt: at(20, 30),
          endsAt: at(21, 30),
        }),
      ],
    })

    expect(board().getAllByText('Los Pibes vs Rivales FC')).toHaveLength(1)
    // El segundo hueco no repite la ficha: dice qué partido lo está tomando.
    expect(board().getAllByText('Acá juega Los Pibes vs Rivales FC.')).toHaveLength(1)
  })
})
