// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

/**
 * El corte de zonas (B16).
 *
 * `seedPlayoffs` puede fallar por tres motivos que el usuario no puede
 * adivinar. Lo que se prueba acá es que la tarjeta los ANTICIPE con el mismo
 * criterio que el service, y que el sorteo de desempate — el único camino que
 * el propio mensaje de error indica — escriba el `seed` de cada equipo.
 */

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const toastMock = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}))

import { CorteZonasCard } from '@/app/(admin)/torneos/[id]/posiciones/CorteZonasCard'
import type { CrossPreview } from '@/app/(admin)/torneos/[id]/posiciones/corte-lib'

const CROSSES: CrossPreview[] = [
  {
    id: 'sf-1',
    round: 'Semifinal',
    homeLabel: '1º Zona A',
    homeTeamName: null,
    awayLabel: '2º Zona B',
    awayTeamName: null,
  },
]

const seedAction = vi.fn(async () => ({ success: true as const }))
const updateTeamAction = vi.fn(async () => ({ success: true as const }))

function renderCard(props: Partial<React.ComponentProps<typeof CorteZonasCard>> = {}) {
  render(
    <CorteZonasCard
      tournamentId="tour-1"
      pendingGroupMatches={0}
      crosses={CROSSES}
      tie={null}
      alreadySeeded={false}
      canSeed
      seedAction={seedAction}
      updateTeamAction={updateTeamAction}
      {...props}
    />,
  )
}

const TIE = {
  groupLabel: 'A',
  teams: [
    { teamId: 'team-1', teamName: 'Los Pibes', seed: null },
    { teamId: 'team-2', teamName: 'Atlético Fondo', seed: null },
  ],
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('CorteZonasCard — bloqueos anticipados', () => {
  it('con partidos de zona pendientes no deja sortear y dice cuántos faltan', () => {
    renderCard({ pendingGroupMatches: 3 })
    expect(screen.getByText(/Faltan 3 partidos de zona/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /cerrar zonas y sortear/i })).toBeDisabled()
  })

  it('con un empate en el corte tampoco, y ofrece resolverlo', () => {
    renderCard({ tie: TIE })
    expect(screen.getByRole('button', { name: /cerrar zonas y sortear/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /definir el sorteo/i })).toBeTruthy()
  })

  it('sin permiso muestra el estado igual, con candado en vez de botón', () => {
    renderCard({ canSeed: false })
    expect(screen.queryByRole('button', { name: /cerrar zonas y sortear/i })).toBeNull()
    expect(screen.getByText(/solo el dueño puede hacerlo/i)).toBeTruthy()
    expect(screen.getByText('Así quedarían los cruces')).toBeTruthy()
  })

  it('ya sorteado: informativa, sin acción', () => {
    renderCard({ alreadySeeded: true })
    expect(screen.getByText('Cruces sorteados')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /cerrar zonas y sortear/i })).toBeNull()
  })
})

describe('CorteZonasCard — sortear (Clase B)', () => {
  it('confirma antes, con las consecuencias reales del cuadro', async () => {
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /cerrar zonas y sortear/i }))
    expect(seedAction).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('El cuadro queda armado con los clasificados de cada zona.'),
    ).toBeTruthy()
    expect(
      within(dialog).getByText(
        'Una vez que se juegue un cruce, el cuadro deja de poder rearmarse.',
      ),
    ).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar zonas y sortear' }))
    await waitFor(() => expect(seedAction).toHaveBeenCalledWith({ tournamentId: 'tour-1' }))
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Cruces sorteados' }),
      ),
    )
  })

  it('un rechazo del servidor deja el diálogo abierto con el error', async () => {
    seedAction.mockResolvedValueOnce({
      success: false,
      error: 'Faltan 2 partido(s) de zona por cerrar.',
    } as never)
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /cerrar zonas y sortear/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar zonas y sortear' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Faltan 2 partido/)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('CorteZonasCard — sorteo de desempate (updateTeamAction)', () => {
  async function openSorteo() {
    renderCard({ tie: TIE })
    fireEvent.click(screen.getByRole('button', { name: /definir el sorteo/i }))
    return screen.findByRole('dialog')
  }

  it('escribe el seed de cada equipo empatado', async () => {
    const dialog = await openSorteo()

    fireEvent.change(within(dialog).getByLabelText('Los Pibes'), { target: { value: '2' } })
    fireEvent.change(within(dialog).getByLabelText('Atlético Fondo'), { target: { value: '1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /guardar el sorteo/i }))

    await waitFor(() => expect(updateTeamAction).toHaveBeenCalledTimes(2))
    expect(updateTeamAction).toHaveBeenNthCalledWith(1, { id: 'team-1', seed: 2 })
    expect(updateTeamAction).toHaveBeenNthCalledWith(2, { id: 'team-2', seed: 1 })
  })

  it('dos equipos con el mismo número no se guardan', async () => {
    const dialog = await openSorteo()

    fireEvent.change(within(dialog).getByLabelText('Atlético Fondo'), { target: { value: '1' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/mismo número/i)

    fireEvent.click(within(dialog).getByRole('button', { name: /guardar el sorteo/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(updateTeamAction).not.toHaveBeenCalled()
  })

  it('arranca proponiendo 1, 2, 3… para que el sorteo se cargue tipeando poco', async () => {
    const dialog = await openSorteo()
    expect(within(dialog).getByLabelText('Los Pibes')).toHaveValue(1)
    expect(within(dialog).getByLabelText('Atlético Fondo')).toHaveValue(2)
  })
})
