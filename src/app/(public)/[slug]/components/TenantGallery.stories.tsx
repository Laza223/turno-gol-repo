import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import TenantGallery from './TenantGallery'

// 6 fotos: 1 principal + 4 thumbnails + la 6ta se resume en el badge "+1" del último thumbnail.
const PHOTOS = [
  '/bg-hero.png',
  '/bg-hero-2.png',
  '/bg-owner.png',
  '/bg-how-it-works.png',
  '/hero-bg.png',
  '/bg-hero.png',
]

/** En el perfil vive dentro de la card blanca principal (`page.tsx`, `space-y-7`), primer bloque. */
const meta = {
  title: 'Player/TenantProfile/TenantGallery',
  component: TenantGallery,
  parameters: { layout: 'padded' },
  args: { name: 'Complejo Fénix' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-3xl border border-border bg-card p-4 shadow-xs sm:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TenantGallery>

export default meta
type Story = StoryObj<typeof meta>

/** Sin fotos: el componente no renderiza nada (retorna null). */
export const SinFotos: Story = {
  args: { photos: [] },
}

/** 1 sola foto: sin fila de thumbnails. */
export const UnaFoto: Story = {
  args: { photos: [PHOTOS[0]!] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: /foto principal/i })).toBeInTheDocument()
  },
}

/** Varias fotos: foto principal + thumbnails, badge "+N" en la última. */
export const VariasFotos: Story = {
  args: { photos: PHOTOS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('+1')).toBeInTheDocument()
  },
}

/** Click en una foto abre el lightbox: navegación por teclado (← / → / Esc). */
export const LightboxAbierto: Story = {
  args: { photos: PHOTOS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('img', { name: /foto principal/i }))

    const dialog = within(canvas.getByRole('dialog', { name: /fotos de complejo fénix/i }))
    await expect(dialog.getByText('1 / 6')).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Foto siguiente' }))
    await expect(dialog.getByText('2 / 6')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
