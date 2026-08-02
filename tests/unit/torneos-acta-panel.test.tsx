// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const toastMock = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}))

import { ActaPanel } from '@/app/(admin)/torneos/[id]/partidos/[matchId]/ActaPanel'
import type { TournamentMatchEventView, TournamentMatchView } from '@/modules/tournaments/tournament.types'

const saveResultAction = vi.fn(async () => ({ success: true as const }))
const walkoverAction = vi.fn(async () => ({ success: true as const }))
const clearResultAction = vi.fn(async () => ({ success: true as const }))
const addEventAction = vi.fn(async () => ({ success: true as const }))
const deleteEventAction = vi.fn(async () => ({ success: true as const }))

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
    homeScore: 0,
    awayScore: 0,
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

function event(overrides: Partial<TournamentMatchEventView> = {}): TournamentMatchEventView {
  return {
    id: 'ev-1',
    tenantId: 't1',
    tournamentId: 'tour-1',
    matchId: 'match-1',
    teamId: 'team-1',
    teamPlayerId: 'tp-1',
    type: 'goal',
    minute: 23,
    suspensionMatches: null,
    notes: null,
    createdByStaff: null,
    createdAt: new Date(),
    teamName: 'Los Pibes',
    playerName: 'Juan Pérez',
    shirtNumber: 10,
    ...overrides,
  }
}

const rosters = [
  { teamId: 'team-1', teamName: 'Los Pibes', players: [] },
  { teamId: 'team-2', teamName: 'Rivales FC', players: [] },
]

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('ActaPanel — walkover (Clase B: ConfirmDialog)', () => {
  it('no ejecuta al primer click; confirma antes de cargar el walkover', async () => {
    render(
      <ActaPanel
        match={match()}
        stageKind="league"
        events={[]}
        rosters={rosters}
        suspendedPlayerIds={[]}
        saveResultAction={saveResultAction}
        walkoverAction={walkoverAction}
        clearResultAction={clearResultAction}
        addEventAction={addEventAction}
        deleteEventAction={deleteEventAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Ganó Los Pibes por no presentación/ }))
    expect(walkoverAction).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Ganó Los Pibes por no presentación.')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cargar walkover' }))
    await waitFor(() =>
      expect(walkoverAction).toHaveBeenCalledWith({ matchId: 'match-1', winnerTeamId: 'team-1' }),
    )
  })
})

describe('ActaPanel — borrar resultado (Clase B: ConfirmDialog)', () => {
  it('avisa que la tabla se recalcula antes de borrar', async () => {
    render(
      <ActaPanel
        match={match({ status: 'played', homeScore: 2, awayScore: 1 })}
        stageKind="league"
        events={[]}
        rosters={rosters}
        suspendedPlayerIds={[]}
        saveResultAction={saveResultAction}
        walkoverAction={walkoverAction}
        clearResultAction={clearResultAction}
        addEventAction={addEventAction}
        deleteEventAction={deleteEventAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Borrar resultado' }))
    expect(clearResultAction).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/se recalculan sin este partido/)).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Borrar resultado' }))
    await waitFor(() => expect(clearResultAction).toHaveBeenCalledWith({ matchId: 'match-1' }))
  })
})

describe('ActaPanel — borrar evento (Clase A: ejecuta ya + Deshacer)', () => {
  it('ejecuta directo sin confirmación', async () => {
    render(
      <ActaPanel
        match={match()}
        stageKind="league"
        events={[event()]}
        rosters={rosters}
        suspendedPlayerIds={[]}
        saveResultAction={saveResultAction}
        walkoverAction={walkoverAction}
        clearResultAction={clearResultAction}
        addEventAction={addEventAction}
        deleteEventAction={deleteEventAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Borrar gol de Juan Pérez/ }))
    await waitFor(() => expect(deleteEventAction).toHaveBeenCalledWith({ eventId: 'ev-1' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('el toast de éxito ofrece Deshacer, que recrea el evento con los mismos datos', async () => {
    render(
      <ActaPanel
        match={match()}
        stageKind="league"
        events={[event()]}
        rosters={rosters}
        suspendedPlayerIds={[]}
        saveResultAction={saveResultAction}
        walkoverAction={walkoverAction}
        clearResultAction={clearResultAction}
        addEventAction={addEventAction}
        deleteEventAction={deleteEventAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Borrar gol de Juan Pérez/ }))
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: expect.objectContaining({ label: 'Deshacer' }) }),
      ),
    )
    const call = toastMock.mock.calls.find((c) => c[0]?.action)
    await act(async () => {
      call?.[0]?.action?.onClick()
    })
    await waitFor(() =>
      expect(addEventAction).toHaveBeenCalledWith({
        matchId: 'match-1',
        teamId: 'team-1',
        teamPlayerId: 'tp-1',
        type: 'goal',
        minute: 23,
      }),
    )
  })
})

describe('ActaPanel — vacío del acta', () => {
  it('sin eventos, muestra el EmptyState', () => {
    render(
      <ActaPanel
        match={match()}
        stageKind="league"
        events={[]}
        rosters={rosters}
        suspendedPlayerIds={[]}
        saveResultAction={saveResultAction}
        walkoverAction={walkoverAction}
        clearResultAction={clearResultAction}
        addEventAction={addEventAction}
        deleteEventAction={deleteEventAction}
      />,
    )
    expect(screen.getByText('Todavía no hay goles ni tarjetas cargados.')).toBeTruthy()
  })
})
