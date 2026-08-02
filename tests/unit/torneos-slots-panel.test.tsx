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

import { SlotsPanel } from '@/app/(admin)/torneos/[id]/SlotsPanel'
import type { TournamentSlotRow } from '@/modules/tournaments/tournament.types'

const reserveAction = vi.fn(async () => ({ success: true as const, reserved: 1, conflicts: [] }))
const releaseAction = vi.fn(async () => ({ success: true as const }))

function slot(overrides: Partial<TournamentSlotRow> = {}): TournamentSlotRow {
  return {
    bookingId: 'b1',
    courtId: 'court-1',
    date: '2099-01-01',
    timeStart: '14:00',
    timeEnd: '15:00',
    startsAt: new Date('2099-01-01T17:00:00Z'),
    endsAt: new Date('2099-01-01T18:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('SlotsPanel — liberar horarios (Clase B: ConfirmDialog, sin Deshacer)', () => {
  it('no ejecuta al primer click; el diálogo cuenta las horas que se liberan', async () => {
    render(
      <SlotsPanel
        tournamentId="tour-1"
        courts={[{ id: 'court-1', name: 'Cancha 1' }]}
        slots={[slot(), slot({ bookingId: 'b2' })]}
        courtNames={{ 'court-1': 'Cancha 1' }}
        reserveAction={reserveAction}
        releaseAction={releaseAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Liberar de hoy en adelante' }))
    expect(releaseAction).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/2 horas quedan libres/)).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Liberar horarios' }))
    await waitFor(() =>
      expect(releaseAction).toHaveBeenCalledWith(
        expect.objectContaining({ tournamentId: 'tour-1' }),
      ),
    )
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Horarios liberados' })),
    )
  })

  it('sin horarios tomados: no ofrece el botón de liberar y muestra el EmptyState', () => {
    render(
      <SlotsPanel
        tournamentId="tour-1"
        courts={[{ id: 'court-1', name: 'Cancha 1' }]}
        slots={[]}
        courtNames={{}}
        reserveAction={reserveAction}
        releaseAction={releaseAction}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Liberar de hoy en adelante' })).toBeNull()
    expect(screen.getByText('Todavía no reservaste ningún horario para este torneo.')).toBeTruthy()
  })
})
