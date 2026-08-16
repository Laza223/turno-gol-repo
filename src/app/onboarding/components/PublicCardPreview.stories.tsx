import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PublicCardPreview } from './PublicCardPreview'

/**
 * Vista previa del paso 1. NO es `FeaturedComplexCard` (esa pide datos que no
 * existen todavía: precio, amenities, rating, foto) — ver el comentario del
 * componente.
 */
const meta = {
  title: 'Onboarding/PublicCardPreview',
  component: PublicCardPreview,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-xs">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PublicCardPreview>

export default meta
type Story = StoryObj<typeof meta>

/** Sin datos: placeholder, nunca inventa un nombre ni una dirección. */
export const SinDatos: Story = {
  args: { name: '', address: '', city: '' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Tu complejo')).toBeInTheDocument()
    await expect(canvas.getByText('Así te van a ver los jugadores.')).toBeInTheDocument()
  },
}

/** Solo el nombre: la ubicación todavía no se muestra (no hay nada que mostrar). */
export const SoloNombre: Story = {
  args: { name: 'Complejo San Martín', address: '', city: '' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Complejo San Martín')).toBeInTheDocument()
    await expect(canvas.getByText('Así te van a ver los jugadores.')).toBeInTheDocument()
  },
}

/** Los tres datos del paso 1 cargados. */
export const Completo: Story = {
  args: { name: 'Complejo San Martín', address: 'Av. Corrientes 1234', city: 'Luján' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Complejo San Martín')).toBeInTheDocument()
    await expect(canvas.getByText('Av. Corrientes 1234 · Luján')).toBeInTheDocument()
    await expect(canvas.queryByText('Así te van a ver los jugadores.')).not.toBeInTheDocument()
  },
}
