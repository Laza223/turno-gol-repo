import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { GridToolbar } from './GridToolbar'

/**
 * Header sticky de la grilla. Usa `-mx-4` para pegarse a los bordes del área de
 * contenido del admin (`admin-layout-shell.tsx` tiene `px-4 sm:px-6 lg:px-8`),
 * así que se reproduce dentro de un contenedor con ese mismo padding — sin él
 * el `-mx-4` se comería el padding de la story en vez de compensar el del shell.
 */
const meta = {
  title: 'Booking/Grid/GridToolbar',
  component: GridToolbar,
  parameters: { layout: 'padded' },
  args: {
    date: '2026-03-14',
    dayLabel: 'Sáb',
    dateLabel: '14 de marzo',
    todayArt: '2026-03-14',
    isCompact: false,
    onToggleDensity: fn(),
    onNavigate: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl px-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GridToolbar>

export default meta
type Story = StoryObj<typeof meta>

export const Comodo: Story = {}

export const Compacto: Story = {
  args: { isCompact: true },
}

export const ToggleDensidad: Story = {
  name: 'Click en el toggle dispara onToggleDensity',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cambiar densidad de la grilla' }))
    await expect(args.onToggleDensity).toHaveBeenCalledOnce()
  },
}

export const BotonHoy: Story = {
  name: '"Hoy" navega a la fecha actual (ART, reloj congelado)',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Hoy' }))
    // computeArtNow() sobre el reloj congelado (2026-03-14T18:30Z = sáb 15:30 ART).
    await expect(args.onNavigate).toHaveBeenCalledWith('2026-03-14')
  },
}
