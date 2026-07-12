import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { FeedbackText } from './FeedbackText'

/** Feedback inline de cada sección del panel de soporte: null, ok (verde) o error (rojo). */
const meta = {
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/FeedbackText',
  component: FeedbackText,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FeedbackText>

export default meta
type Story = StoryObj<typeof meta>

/** Sin feedback todavía: no renderiza nada (el padre no disparó ninguna acción). */
export const SinFeedback: Story = {
  args: { feedback: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
  },
}

export const Ok: Story = {
  args: { feedback: { kind: 'ok', text: 'Trial extendido 7 días (vence 2026-03-21).' } },
}

export const Error: Story = {
  args: {
    feedback: {
      kind: 'error',
      text: 'El nombre ingresado no coincide con el nombre exacto del complejo. No se ejecutó la acción.',
    },
  },
}
