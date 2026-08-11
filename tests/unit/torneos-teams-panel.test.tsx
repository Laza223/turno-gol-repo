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

import { TeamsPanel } from '@/app/(admin)/torneos/[id]/TeamsPanel'
import type {
  TournamentTeamPlayerRow,
  TournamentTeamRow,
} from '@/modules/tournaments/tournament.types'

const addAction = vi.fn(async () => ({ success: true as const }))
const removeAction = vi.fn(async () => ({ success: true as const }))
const updateAction = vi.fn(async () => ({ success: true as const }))
const searchCaptainAction = vi.fn(async () => ({ success: true as const, players: [] }))
const addPlayerAction = vi.fn(async () => ({ success: true as const }))
const removePlayerAction = vi.fn(async () => ({ success: true as const }))

function team(overrides: Partial<TournamentTeamRow> = {}): TournamentTeamRow {
  return {
    id: 'team-1',
    tenantId: 't1',
    tournamentId: 'tour-1',
    name: 'Los Pibes',
    contactPlayerId: null,
    contactName: null,
    contactPhone: null,
    status: 'registered',
    groupLabel: null,
    seed: null,
    inscriptionFee: 0,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function player(overrides: Partial<TournamentTeamPlayerRow> = {}): TournamentTeamPlayerRow {
  return {
    id: 'player-1',
    tenantId: 't1',
    teamId: 'team-1',
    fullName: 'Juan Pérez',
    playerId: null,
    dni: null,
    shirtNumber: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('TeamsPanel — borrar equipo (Clase B: ConfirmDialog con consecuencias)', () => {
  it('no ejecuta al primer click; abre ConfirmDialog con consecuencias', async () => {
    render(
      <TeamsPanel
        tournamentId="tour-1"
        teams={[team()]}
        maxTeams={null}
        rosters={{}}
        addAction={addAction}
        removeAction={removeAction}
        updateAction={updateAction}
        searchCaptainAction={searchCaptainAction}
        addPlayerAction={addPlayerAction}
        removePlayerAction={removePlayerAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Borrar Los Pibes' }))
    expect(removeAction).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('Se borra el plantel completo junto con el equipo.'),
    ).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Borrar equipo' }))
    await waitFor(() => expect(removeAction).toHaveBeenCalledWith({ id: 'team-1' }))
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Equipo borrado', description: 'Los Pibes' }),
      ),
    )
  })

  it('cancelar el diálogo no llama la action', async () => {
    render(
      <TeamsPanel
        tournamentId="tour-1"
        teams={[team()]}
        maxTeams={null}
        rosters={{}}
        addAction={addAction}
        removeAction={removeAction}
        updateAction={updateAction}
        searchCaptainAction={searchCaptainAction}
        addPlayerAction={addPlayerAction}
        removePlayerAction={removePlayerAction}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Borrar Los Pibes' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(removeAction).not.toHaveBeenCalled()
  })

  it('sin equipos: muestra el EmptyState', () => {
    render(
      <TeamsPanel
        tournamentId="tour-1"
        teams={[]}
        maxTeams={null}
        rosters={{}}
        addAction={addAction}
        removeAction={removeAction}
        updateAction={updateAction}
        searchCaptainAction={searchCaptainAction}
        addPlayerAction={addPlayerAction}
        removePlayerAction={removePlayerAction}
      />,
    )
    expect(screen.getByText('Todavía no hay equipos anotados.')).toBeTruthy()
  })
})

describe('TeamsPanel — sacar del plantel (Clase A: ejecuta ya + Deshacer)', () => {
  function renderExpanded() {
    render(
      <TeamsPanel
        tournamentId="tour-1"
        teams={[team()]}
        maxTeams={null}
        rosters={{ 'team-1': [player()] }}
        addAction={addAction}
        removeAction={removeAction}
        updateAction={updateAction}
        searchCaptainAction={searchCaptainAction}
        addPlayerAction={addPlayerAction}
        removePlayerAction={removePlayerAction}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Los Pibes/ }))
  }

  it('ejecuta directo sin confirmación (reversible y barato)', async () => {
    renderExpanded()
    fireEvent.click(await screen.findByRole('button', { name: 'Sacar a Juan Pérez del plantel' }))
    await waitFor(() => expect(removePlayerAction).toHaveBeenCalledWith({ id: 'player-1' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('el toast de éxito ofrece Deshacer, que recrea al jugador con los mismos datos', async () => {
    renderExpanded()
    fireEvent.click(await screen.findByRole('button', { name: 'Sacar a Juan Pérez del plantel' }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sacado del plantel',
          action: expect.objectContaining({ label: 'Deshacer' }),
        }),
      ),
    )
    const call = toastMock.mock.calls.find((c) => c[0]?.title === 'Sacado del plantel')
    await act(async () => {
      call?.[0]?.action?.onClick()
    })
    await waitFor(() =>
      expect(addPlayerAction).toHaveBeenCalledWith({
        teamId: 'team-1',
        fullName: 'Juan Pérez',
        playerId: null,
        dni: null,
        shirtNumber: 10,
      }),
    )
  })
})

/**
 * B16: el estado del equipo es el camino que el propio producto indica cuando
 * un equipo no se puede borrar ("marcalo como se bajó", `mapTournamentError`),
 * y hasta ahora no existía en la UI.
 */
describe('TeamsPanel — estado del equipo (updateTeamAction)', () => {
  function renderExpanded(t: TournamentTeamRow = team()) {
    render(
      <TeamsPanel
        tournamentId="tour-1"
        teams={[t]}
        maxTeams={null}
        rosters={{}}
        addAction={addAction}
        removeAction={removeAction}
        updateAction={updateAction}
        searchCaptainAction={searchCaptainAction}
        addPlayerAction={addPlayerAction}
        removePlayerAction={removePlayerAction}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Los Pibes/ }))
  }

  it('confirmar es Clase A: se aplica ya y el toast ofrece Deshacer al estado previo', async () => {
    renderExpanded()

    fireEvent.click(await screen.findByRole('radio', { name: /Confirmado/ }))

    await waitFor(() =>
      expect(updateAction).toHaveBeenCalledWith({ id: 'team-1', status: 'confirmed' }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()

    const call = toastMock.mock.calls.at(-1)
    expect(call?.[0]?.action?.label).toBe('Deshacer')
    await act(async () => {
      call?.[0]?.action?.onClick()
    })
    await waitFor(() =>
      expect(updateAction).toHaveBeenLastCalledWith({ id: 'team-1', status: 'registered' }),
    )
  })

  it('"se bajó" es Clase B: pide confirmación y dice las consecuencias reales', async () => {
    renderExpanded()

    fireEvent.click(await screen.findByRole('radio', { name: /Se bajó/ }))
    expect(updateAction).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Deja de ocupar un lugar del cupo del torneo.')).toBeTruthy()
    expect(
      within(dialog).getByText('Los partidos que ya jugó quedan como están, con sus resultados.'),
    ).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar que se bajó' }))
    await waitFor(() =>
      expect(updateAction).toHaveBeenCalledWith({ id: 'team-1', status: 'withdrawn' }),
    )
    // Una baja no se deshace con un click: se vuelve a poner el estado a mano.
    expect(toastMock.mock.calls.at(-1)?.[0]?.action).toBeUndefined()
  })

  it('descalificar agrega su propia consecuencia y va en rojo', async () => {
    renderExpanded()

    fireEvent.click(await screen.findByRole('radio', { name: /Descalificado/ }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('Queda listado como descalificado en la tabla de posiciones.'),
    ).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Descalificar' })).toBeTruthy()
  })

  it('un error del servidor se muestra y el estado no se mueve', async () => {
    updateAction.mockResolvedValueOnce({
      success: false,
      error: 'El torneo ya llegó al cupo de 12 equipos.',
    } as never)
    renderExpanded(team({ status: 'withdrawn' }))

    fireEvent.click(await screen.findByRole('radio', { name: /Inscripto/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/cupo de 12 equipos/)
    expect(screen.getByRole('radio', { name: /Se bajó/ })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('TeamsPanel — editar datos del equipo (updateTeamAction)', () => {
  it('manda nombre, contacto, arancel y notas en una sola llamada', async () => {
    render(
      <TeamsPanel
        tournamentId="tour-1"
        teams={[team({ contactName: 'Juan', inscriptionFee: 4_500_000 })]}
        maxTeams={null}
        rosters={{}}
        addAction={addAction}
        removeAction={removeAction}
        updateAction={updateAction}
        searchCaptainAction={searchCaptainAction}
        addPlayerAction={addPlayerAction}
        removePlayerAction={removePlayerAction}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Los Pibes/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Editar datos/ }))

    const nombre = await screen.findByLabelText('Nombre del equipo', {
      selector: '#equipo-team-1-nombre',
    })
    fireEvent.change(nombre, { target: { value: 'Los Pibes FC' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(updateAction).toHaveBeenCalledWith({
        id: 'team-1',
        name: 'Los Pibes FC',
        contactPlayerId: null,
        contactName: 'Juan',
        contactPhone: null,
        inscriptionFee: 4_500_000,
        notes: null,
      }),
    )
  })
})
