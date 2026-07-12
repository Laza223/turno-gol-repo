import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { publicCourtCard, publicCourtCardNoPhoto, publicCourtCardNoPrice } from '@/test/fixtures/public'
import CourtCard from './CourtCard'

/**
 * En el perfil real vive dentro de una grilla de 2 a 5 columnas, adentro de la
 * card blanca principal (`page.tsx`: `rounded-3xl border bg-card p-4 ... space-y-7`).
 * Reproducimos ambos niveles: si no, el hover/shadow y el ancho de la tarjeta
 * (fija a ~1 celda de grilla) no se ven representativos.
 */
const meta = {
  title: 'Player/TenantProfile/CourtCard',
  component: CourtCard,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof CourtCard>

export default meta
type Story = StoryObj<typeof meta>

/** Con foto y precio "desde". */
export const Default: Story = {
  args: { court: publicCourtCard() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: /cancha 1/i })).toBeInTheDocument()
    await expect(canvas.getByText('Fútbol 5')).toBeInTheDocument()
  },
}

/** Sin foto: placeholder con degradé emerald + ícono. */
export const SinFoto: Story = {
  args: { court: publicCourtCardNoPhoto() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument()
  },
}

/** Sin canchas con pricing configurado: no muestra la línea de precio "desde". */
export const SinPrecio: Story = {
  args: { court: publicCourtCardNoPrice() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/desde/i)).not.toBeInTheDocument()
  },
}
