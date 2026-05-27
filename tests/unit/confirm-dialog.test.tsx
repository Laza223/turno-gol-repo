// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

describe('ConfirmDialog', () => {
  it('type-to-confirm gates the confirm button', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Cerrar caja"
        confirmationPhrase="CERRAR"
        confirmLabel="Cerrar caja"
        onConfirm={onConfirm}
      />,
    )

    const confirmBtn = (await screen.findByRole('button', {
      name: 'Cerrar caja',
    })) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    const phraseInput = screen.getByLabelText(/Escribí/i, {
      exact: false,
    }) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: 'CERRAR' } })

    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(false)
    })
  })

  it('onConfirm returning {success:false} keeps the dialog open and shows the error', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ success: false, error: 'boom' })
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Acción destructiva"
        confirmLabel="Confirmar"
        onConfirm={onConfirm}
      />,
    )

    const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('boom')
    })

    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('onConfirm success closes the dialog', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ success: true })
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirmar acción"
        confirmLabel="Confirmar"
        onConfirm={onConfirm}
      />,
    )

    const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('cancel closes the dialog', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirmar acción"
        cancelLabel="Cancelar"
        onConfirm={onConfirm}
      />,
    )

    const cancelBtn = await screen.findByRole('button', { name: 'Cancelar' })
    fireEvent.click(cancelBtn)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
