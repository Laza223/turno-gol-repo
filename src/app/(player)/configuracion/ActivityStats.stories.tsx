import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import ActivityStats from './ActivityStats'

/** Lo que jugaste, en neutro: tres renglones, sin puntajes ni colores por logro. */
const meta = {
  title: 'Player/Configuracion/ActivityStats',
  component: ActivityStats,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-[35rem] bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActivityStats>

export default meta
type Story = StoryObj<typeof meta>

export const Activo: Story = {
  args: { played: 12, venues: 3, streakWeeks: 4 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Tu actividad' }),
    ).toBeInTheDocument()
    await expect(canvas.getByText('Partidos jugados').nextElementSibling).toHaveTextContent('12')
    await expect(canvas.getByText('Complejos visitados').nextElementSibling).toHaveTextContent('3')
    await expect(canvas.getByText('Racha').nextElementSibling).toHaveTextContent('4 semanas')
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument()
  },
}

export const UnaSemanaDeRacha: Story = {
  args: { played: 1, venues: 1, streakWeeks: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('1 semana')).toBeInTheDocument()
  },
}

/** Con cero partidos, la salida es reservar. */
export const SinPartidos: Story = {
  args: { played: 0, venues: 0, streakWeeks: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/tu primer partido/i)).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Reservar una cancha' })).toHaveAttribute(
      'href',
      '/explorar',
    )
  },
}
