import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { FeedbackText } from './FeedbackText'

/** Feedback inline de cada sección del panel de soporte: null, ok (verde) o error (rojo). */
const meta = {
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/FeedbackText',
  component: FeedbackText,
  parameters: { layout: 'padded' },
  // Siempre vive dentro de un <SectionCard> (bg-card blanco) — ver
  // ExtendTrialSection.tsx y compañía. Suelto sobre bg-background,
  // green-700/red-600 miden 4.03:1 / 3.88:1 y fallan axe; sobre bg-card
  // blanco miden 5.02:1 / 4.83:1 y pasan. El contenedor no es cosmético.
  decorators: [
    (Story) => (
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Story />
      </div>
    ),
  ],
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
