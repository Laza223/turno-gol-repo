import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import TenantCardCarousel from './TenantCardCarousel'

const PHOTOS = [
  '/bg-hero-desktop.png',
  '/bg-hero-2.png',
  '/bg-owner.png',
  '/bg-how-it-works.png',
  '/hero-bg.png',
  '/bg-hero-desktop.png',
  '/bg-hero-2.png',
]

/** Vive absolute-positioned dentro del `aspect-video` de la foto de TenantCard. */
const meta = {
  title: 'Player/Explorar/TenantCardCarousel',
  component: TenantCardCarousel,
  parameters: { layout: 'padded' },
  args: { name: 'Complejo Fénix', href: '/complejo-fenix' },
  decorators: [
    (Story) => (
      <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-2xl bg-muted">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TenantCardCarousel>

export default meta
type Story = StoryObj<typeof meta>

/** 1 sola foto: sin chevrons ni dots, el tap navega directo al perfil. */
export const UnaFoto: Story = {
  args: { photos: [PHOTOS[0]!] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Foto siguiente' })).not.toBeInTheDocument()
  },
}

/** 2+ fotos: chevrons + dots, navegación con flecha derecha y por teclado. */
export const VariasFotos: Story = {
  args: { photos: PHOTOS.slice(0, 3) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const next = canvas.getByRole('button', { name: 'Foto siguiente' })
    await expect(canvas.getByRole('button', { name: 'Foto anterior' })).toBeDisabled()
    await userEvent.click(next)
    // El scroll (smooth o instantáneo según prefers-reduced-motion) es async: reintenta.
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Foto anterior' })).toBeEnabled())
  },
}

/** Más de 5 fotos: la última muestra el badge "+N" con el resto. */
export const ConBadgeExtra: Story = {
  args: { photos: PHOTOS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('+2')).toBeInTheDocument()
  },
}
