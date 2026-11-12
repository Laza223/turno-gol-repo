import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { ActionResult } from '@/shared/types/action-result'
import { EmailVerifyBanner } from './email-verify-banner'

const ok = async (): Promise<ActionResult> => ({ success: true })

const meta = {
  title: 'Layout/EmailVerifyBanner',
  component: EmailVerifyBanner,
  parameters: { layout: 'fullscreen' },
  args: {
    email: 'marcelo@complejo.com',
    resendAction: fn(ok),
    changeEmailAction: fn(ok),
  },
} satisfies Meta<typeof EmailVerifyBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Reenviar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reenviar mail' }))
    await expect(await canvas.findByText('Listo, te mandamos el mail de nuevo.')).toBeVisible()
  },
}

export const ReenvioLimitado: Story = {
  args: {
    resendAction: fn(async (): Promise<ActionResult> => ({
      success: false,
      error: 'Ya te mandamos el mail hace poco. Esperá unos minutos y probá de nuevo.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reenviar mail' }))
    await expect(await canvas.findByText(/Ya te mandamos el mail/)).toBeVisible()
  },
}

export const CambiarMailConError: Story = {
  args: {
    changeEmailAction: fn(async (): Promise<ActionResult> => ({
      success: false,
      error: 'Ese mail ya tiene una cuenta en TurnoGol.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '¿Está mal? Cambialo' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.type(await body.findByLabelText('Mail nuevo'), 'otro@complejo.com')
    await userEvent.click(body.getByRole('button', { name: 'Cambiar y reenviar' }))
    await expect(await body.findByText('Ese mail ya tiene una cuenta en TurnoGol.')).toBeVisible()
  },
}
