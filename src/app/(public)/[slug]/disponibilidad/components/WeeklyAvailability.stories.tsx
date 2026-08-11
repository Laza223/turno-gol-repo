import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { weeklyAvailabilityResponse } from '@/test/fixtures/public'
import WeeklyAvailability from './WeeklyAvailability'

/** Vive dentro del `max-w-3xl` de `disponibilidad/page.tsx`, debajo del breadcrumb + h1. */
const meta = {
  title: 'Player/TenantProfile/WeeklyAvailability',
  component: WeeklyAvailability,
  parameters: { layout: 'padded' },
  args: { slug: 'complejo-fenix', week: weeklyAvailabilityResponse() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WeeklyAvailability>

export default meta
type Story = StoryObj<typeof meta>

/** Tab del primer día activo por defecto, con canchas y turnos libres + precio. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tabs = canvas.getAllByRole('button')
    await expect(tabs[0]).toHaveAttribute('aria-pressed', 'true')
    await expect((await canvas.findAllByRole('link')).length).toBeGreaterThan(0)
  },
}

/** Cambiar de día activa otro tab — el día con `slots: []` (día cerrado) muestra "Sin turnos libres." en la cancha. */
export const CambiarDeDiaSinTurnos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tabs = canvas.getAllByRole('button')
    // El día índice 3 (fixture) trae 1 cancha sin ningún slot generado (día cerrado/fuera de horario).
    await userEvent.click(tabs[3]!)
    await expect(tabs[3]).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByText('Sin turnos libres.')).toBeInTheDocument()
  },
}
