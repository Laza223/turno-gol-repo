// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BanPlayerDialog } from '@/components/admin/BanPlayerDialog'

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('BanPlayerDialog — defaults (decisión del dueño 2026-08-01, 🔴 §4.11)', () => {
  it('arranca con 7 días seleccionado, nunca "Permanente" ni un motivo precargado', async () => {
    const banPlayerAction = vi.fn(async () => ({ success: true }))
    render(
      <BanPlayerDialog
        open={true}
        onOpenChange={vi.fn()}
        playerId="p1"
        banPlayerAction={banPlayerAction}
      />,
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: '7 días' })).toBeChecked()
    expect(within(dialog).getByLabelText('Motivo (obligatorio)')).toHaveValue('')
  })

  it('"Permanente" sigue disponible como opción manual', async () => {
    const banPlayerAction = vi.fn(async () => ({ success: true }))
    render(
      <BanPlayerDialog
        open={true}
        onOpenChange={vi.fn()}
        playerId="p1"
        banPlayerAction={banPlayerAction}
      />,
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: 'Permanente' })).toBeTruthy()
  })

  it('sin motivo, no llama la action', async () => {
    const banPlayerAction = vi.fn(async () => ({ success: true }))
    render(
      <BanPlayerDialog
        open={true}
        onOpenChange={vi.fn()}
        playerId="p1"
        banPlayerAction={banPlayerAction}
      />,
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bloquear jugador' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ingresá un motivo.')
    expect(banPlayerAction).not.toHaveBeenCalled()
  })

  it('con motivo, llama la action con el playerId/motivo/duración elegidos', async () => {
    const banPlayerAction = vi.fn(async () => ({ success: true }))
    const onBanned = vi.fn()
    render(
      <BanPlayerDialog
        open={true}
        onOpenChange={vi.fn()}
        playerId="p1"
        banPlayerAction={banPlayerAction}
        onBanned={onBanned}
      />,
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: '30 días' }))
    fireEvent.change(within(dialog).getByLabelText('Motivo (obligatorio)'), {
      target: { value: 'Conflicto en el mostrador' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bloquear jugador' }))

    await waitFor(() =>
      expect(banPlayerAction).toHaveBeenCalledWith('p1', 'Conflicto en el mostrador', '30d'),
    )
    await waitFor(() => expect(onBanned).toHaveBeenCalled())
  })

  it('el nombre del jugador aparece en la confirmación cuando se provee', async () => {
    render(
      <BanPlayerDialog
        open={true}
        onOpenChange={vi.fn()}
        playerId="p1"
        playerName="Juan Pérez"
        banPlayerAction={vi.fn()}
      />,
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Juan Pérez/)).toBeTruthy()
  })
})
