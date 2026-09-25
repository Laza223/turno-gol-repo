import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { SectionHeader } from './SectionHeader'

/**
 * Sin card alrededor: el encabezado apoya directo sobre el fondo de la página,
 * que es justamente su razón de ser. Se reproduce ese fondo para medir el
 * contraste donde de verdad vive.
 */
const meta = {
  title: 'Design System/SectionHeader',
  component: SectionHeader,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="bg-background p-6">
        <Story />
      </div>
    ),
  ],
  args: { title: 'Movimientos del día' },
} satisfies Meta<typeof SectionHeader>

export default meta
type Story = StoryObj<typeof meta>

export const SoloTitulo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Movimientos del día' }),
    ).toBeVisible()
  },
}

/** El dato va al lado del título, no debajo: es lo que contesta su pregunta. */
export const ConMetaYAccion: Story = {
  args: {
    title: 'Sin cobrar',
    meta: (
      <>
        <span className="font-semibold text-foreground">$ 140.300</span> · 14 personas
      </>
    ),
    actions: (
      <button
        type="button"
        className="h-11 rounded-lg border border-border px-3 text-sm font-medium md:h-9"
      >
        Registrar movimiento
      </button>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 2, name: 'Sin cobrar' })).toBeVisible()
    await expect(canvas.getByText(/14 personas/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Registrar movimiento' })).toBeVisible()
  },
}
