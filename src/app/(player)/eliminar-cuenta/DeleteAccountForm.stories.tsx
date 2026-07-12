import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { DeleteAccountForm } from './DeleteAccountForm'

/**
 * La Server Action entra por prop (ver el comentario en DeleteAccountForm.tsx).
 * ConfirmDialog (Radix) monta su contenido en un portal fuera de canvasElement:
 * las assertions post-apertura usan `screen` (todo document.body), no `within`.
 */
const meta = {
  title: 'Player/EliminarCuenta/DeleteAccountForm',
  component: DeleteAccountForm,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/eliminar-cuenta' } },
  },
  args: {
    confirmEmail: 'tomas.ibanez@example.com',
  },
} satisfies Meta<typeof DeleteAccountForm>

export default meta
type Story = StoryObj<typeof meta>

export const Cerrado: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
}

/** Confirmar queda deshabilitado hasta tipear el email exacto (type-to-confirm). */
export const Abierto: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await expect(await screen.findByText('¿Eliminar tu cuenta TurnoGol?')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    const confirmButton = within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' })
    await expect(confirmButton).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/tomas\.ibanez@example\.com/i), 'tomas.ibanez@example.com')
    await expect(confirmButton).toBeEnabled()
  },
}

/** onConfirm devuelve error: el dialog queda abierto con el mensaje inline. */
export const ErrorAlConfirmar: Story = {
  args: {
    action: fn(async () => ({
      success: false as const,
      error: 'No encontramos tu cuenta. Cerrá sesión y volvé a intentar.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await userEvent.type(
      await screen.findByLabelText(/tomas\.ibanez@example\.com/i),
      'tomas.ibanez@example.com',
    )
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }))
    await expect(await screen.findByRole('alert')).toHaveTextContent(/no encontramos tu cuenta/i)
  },
}

/** Éxito: router.push('/ingresar?deleted=1'). */
export const ConfirmadoOk: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await userEvent.type(
      await screen.findByLabelText(/tomas\.ibanez@example\.com/i),
      'tomas.ibanez@example.com',
    )
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }))
    await expect(getRouter().push).toHaveBeenCalledWith('/ingresar?deleted=1')
  },
}
