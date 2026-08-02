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

const banPlayerActionMock = vi.fn(async (_playerId: string, _reason: string, _duration: string) => ({
  success: true,
}))
vi.mock('@/app/(admin)/jugadores/actions', () => ({
  banPlayerAction: (playerId: string, reason: string, duration: string) =>
    banPlayerActionMock(playerId, reason, duration),
}))

import { ManualBanDialog } from '@/app/(admin)/deudas/ManualBanDialog'

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('ManualBanDialog (deudas) — unificado con BanPlayerDialog (🔴 §4.11)', () => {
  it('usa la action auditada de jugadores, no una propia', async () => {
    render(<ManualBanDialog player={{ id: 'p1', name: 'Juan Pérez' }} onClose={vi.fn()} />)

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Motivo (obligatorio)'), {
      target: { value: 'Deuda de $5.000' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bloquear jugador' }))

    await waitFor(() =>
      expect(banPlayerActionMock).toHaveBeenCalledWith('p1', 'Deuda de $5.000', '7d'),
    )
  })

  it('arranca en 7 días sin motivo precargado (antes: 30d + "Deuda incobrable de reserva")', async () => {
    render(<ManualBanDialog player={{ id: 'p1', name: 'Juan Pérez' }} onClose={vi.fn()} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: '7 días' })).toBeChecked()
    expect(within(dialog).getByLabelText('Motivo (obligatorio)')).toHaveValue('')
  })

  it('al confirmar: toast, router.refresh y onClose/onSuccess', async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    render(<ManualBanDialog player={{ id: 'p1', name: 'Juan Pérez' }} onClose={onClose} onSuccess={onSuccess} />)

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Motivo (obligatorio)'), { target: { value: 'Motivo' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bloquear jugador' }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Jugador bloqueado', description: 'Juan Pérez' }),
      ),
    )
    expect(refreshMock).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalled()
  })

  it('sin jugador seleccionado, no renderiza nada', () => {
    render(<ManualBanDialog player={null} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cambiar de jugador (key={player.id}) resetea el form sin arrastrar datos del anterior', async () => {
    const { rerender } = render(<ManualBanDialog player={{ id: 'p1', name: 'Juan' }} onClose={vi.fn()} />)
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Permanente' }))
    fireEvent.change(within(dialog).getByLabelText('Motivo (obligatorio)'), { target: { value: 'Motivo de Juan' } })

    rerender(<ManualBanDialog player={{ id: 'p2', name: 'Pedro' }} onClose={vi.fn()} />)
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: '7 días' })).toBeChecked()
    expect(within(dialog).getByLabelText('Motivo (obligatorio)')).toHaveValue('')
  })
})
