import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { paintedContrast } from '@/test/contrast'
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
  decorators: [
    (Story) => (
      <div className="bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DeleteAccountForm>

export default meta
type Story = StoryObj<typeof meta>

export const Cerrado: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
}

/** Confirmar queda deshabilitado hasta tipear el email (type-to-confirm). */
export const Abierto: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await expect(await screen.findByText('¿Eliminar tu cuenta TurnoGol?')).toBeInTheDocument()
    const dialog = await screen.findByRole('dialog')
    const confirmButton = within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' })
    await expect(confirmButton).toBeDisabled()
    await userEvent.type(
      screen.getByLabelText(/tomas\.ibanez@example\.com/i),
      'tomas.ibanez@example.com',
    )
    await expect(confirmButton).toBeEnabled()
  },
}

/** El email se compara sin mayúsculas ni espacios, y el campo se arma para tipear un email. */
export const EmailConMayusculasYEspacios: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Eliminar mi cuenta' }))
    const dialog = await screen.findByRole('dialog')
    const campo = within(dialog).getByLabelText(/tomas\.ibanez@example\.com/i)
    await expect(campo).toHaveAttribute('autocapitalize', 'none')
    await expect(campo).toHaveAttribute('autocorrect', 'off')
    await expect(campo).toHaveAttribute('spellcheck', 'false')
    await expect(campo).toHaveAttribute('inputmode', 'email')
    await userEvent.type(campo, '  Tomas.Ibanez@Example.COM ')
    await expect(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' })).toBeEnabled()
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
    const dialog = await screen.findByRole('dialog')
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
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }))
    await expect(getRouter().push).toHaveBeenCalledWith('/ingresar?deleted=1')
  },
}

const EMAIL_LARGO = 'maria.de.los.angeles.fernandez.de.kirchner@dominio-muy-largo.com.ar'

/**
 * Un email de 60+ caracteres: el rótulo parte de renglón sin ensanchar el diálogo, y el contraste
 * MEDIDO (claro y oscuro) del rótulo, de la ayuda y del confirmar deshabilitado da AA.
 */
export const EmailLargoYContraste: Story = {
  args: {
    confirmEmail: EMAIL_LARGO,
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Eliminar mi cuenta' }))
    const dialog = await screen.findByRole('dialog')
    await expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth)
    const rotulo = within(dialog).getByText(/Escribí/)
    const confirmar = within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' })
    await expect(confirmar).toBeDisabled()
    await expect(parseFloat(getComputedStyle(rotulo).fontSize)).toBeGreaterThanOrEqual(14)
    const medidos: Array<[string, HTMLElement]> = [
      ['rótulo', rotulo],
      ['ayuda', within(dialog).getByText(/se activa cuando escribís/)],
      ['confirmar deshabilitado', confirmar],
    ]
    for (const [nombre, el] of medidos) {
      await expect(await paintedContrast(el), nombre).toBeGreaterThanOrEqual(4.5)
    }
  },
}
