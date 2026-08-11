import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import NotificationPrefs from './NotificationPrefs'

/**
 * La Server Action entra por prop (ver el comentario en NotificationPrefs.tsx).
 * Toggle optimista: el switch cambia al toque; si la action falla, revierte
 * y muestra el error.
 */
const meta = {
  title: 'Player/Perfil/NotificationPrefs',
  component: NotificationPrefs,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof NotificationPrefs>

export default meta
type Story = StoryObj<typeof meta>

export const AmbosActivos: Story = {
  args: {
    initialEmail: true,
    initialPush: true,
    action: fn(async () => ({ success: true as const })),
  },
}

export const AmbosApagados: Story = {
  args: {
    initialEmail: false,
    initialPush: false,
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('switch', { name: 'Novedades por email' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  },
}

/** Toggle exitoso: el switch queda en el nuevo estado. */
export const ToggleOk: Story = {
  args: {
    initialEmail: true,
    initialPush: false,
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pushSwitch = canvas.getByRole('switch', { name: 'Notificaciones push' })
    await expect(pushSwitch).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(pushSwitch)
    await expect(pushSwitch).toHaveAttribute('aria-checked', 'true')
  },
}

/** La action falla: el switch se revierte y aparece el error. */
export const ErrorAlGuardar: Story = {
  args: {
    initialEmail: true,
    initialPush: true,
    action: fn(async () => ({
      success: false as const,
      error: 'No pudimos guardar tu preferencia. Intentá de nuevo.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const emailSwitch = canvas.getByRole('switch', { name: 'Novedades por email' })
    await userEvent.click(emailSwitch)
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'No pudimos guardar tu preferencia. Intentá de nuevo.',
    )
    await expect(emailSwitch).toHaveAttribute('aria-checked', 'true')
  },
}
