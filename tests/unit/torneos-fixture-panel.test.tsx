// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const toastMock = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}))

import { FixturePanel } from '@/app/(admin)/torneos/[id]/fixture/FixturePanel'
import type { TournamentMatchView } from '@/modules/tournaments/tournament.types'

const generateAction = vi.fn(async () => ({ success: true as const, matches: 4, unscheduled: 0 }))
const clearAction = vi.fn(async () => ({ success: true as const }))
const rescheduleAction = vi.fn(async () => ({ success: true as const }))

/**
 * Props que el panel necesita para la Planilla (B16) y que estos casos no
 * ejercitan: sin horas tomadas el tablero muestra su estado vacío, que es
 * justo lo que corresponde acá — lo que se prueba es generar y borrar.
 */
const planillaProps = {
  slots: [],
  courts: [],
  matchDurationMinutes: 60,
  restBetweenMatchesMinutes: 0,
  rescheduleAction,
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

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('FixturePanel — sin fixture: EmptyState (ya existía, verificamos que sigue)', () => {
  it('muestra "Todavía no hay fixture"', () => {
    render(
      <FixturePanel
        tournamentId="tour-1"
        format="league"
        stages={[]}
        matches={[]}
        {...planillaProps}
        generateAction={generateAction}
        clearAction={clearAction}
      />,
    )
    expect(screen.getByText('Todavía no hay fixture')).toBeTruthy()
  })
})

describe('FixturePanel — borrar fixture (Clase B: ConfirmDialog, avisa resultados perdidos)', () => {
  it('no ejecuta al primer click; avisa si hay resultados cargados', async () => {
    render(
      <FixturePanel
        tournamentId="tour-1"
        format="league"
        stages={[]}
        matches={[match({ id: 'm1', status: 'played', homeScore: 2, awayScore: 1 }), match({ id: 'm2' })]}
        {...planillaProps}
        generateAction={generateAction}
        clearAction={clearAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Borrar fixture' }))
    expect(clearAction).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Se borran los 2 partidos del calendario.')).toBeTruthy()
    expect(within(dialog).getByText(/Se pierden los 1 resultados/)).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Borrar fixture' }))
    await waitFor(() => expect(clearAction).toHaveBeenCalledWith({ tournamentId: 'tour-1' }))
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fixture borrado' })),
    )
  })

  it('sin resultados cargados, no menciona resultados perdidos', async () => {
    render(
      <FixturePanel
        tournamentId="tour-1"
        format="league"
        stages={[]}
        matches={[match()]}
        {...planillaProps}
        generateAction={generateAction}
        clearAction={clearAction}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Borrar fixture' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/resultados/)).toBeNull()
  })
})
