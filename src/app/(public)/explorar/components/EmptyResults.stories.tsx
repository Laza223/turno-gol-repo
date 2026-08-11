import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import EmptyResults from './EmptyResults'

const meta = {
  title: 'Player/Explorar/EmptyResults',
  component: EmptyResults,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof EmptyResults>

export default meta
type Story = StoryObj<typeof meta>

/** Sin filtro de disponibilidad: mensaje genérico, sugiere ajustar los filtros. */
export const SinFiltros: Story = {
  args: { avail: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Sin resultados para tu búsqueda' }),
    ).toBeInTheDocument()
  },
}

/** Con filtro de fecha/hora (desde /explorar?date=&time=): mensaje específico sobre ese horario. */
export const SinDisponibilidadEnHorario: Story = {
  args: { avail: { date: '2026-03-14', time: '20:00' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/el 14\/03\/2026 a las 20:00/i)).toBeInTheDocument()
  },
}
