import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { withExplorar } from '../../../../../.storybook/decorators/with-explorar'
import EmptyResults from './EmptyResults'

const meta = {
  title: 'Player/Explorar/EmptyResults',
  component: EmptyResults,
  parameters: { layout: 'fullscreen' },
  decorators: [withExplorar],
} satisfies Meta<typeof EmptyResults>

export default meta
type Story = StoryObj<typeof meta>

/** Ningún complejo con esa localidad, tamaño o nombre: sugiere ajustar la búsqueda. */
export const SinResultados: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Sin resultados para tu búsqueda' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Limpiar búsqueda' })).toBeInTheDocument()
  },
}

/** `?offset=` más allá del total: se terminó la lista. */
export const FueraDeRango: Story = {
  args: { outOfRange: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { name: 'No hay más complejos para mostrar' }),
    ).toBeInTheDocument()
  },
}
