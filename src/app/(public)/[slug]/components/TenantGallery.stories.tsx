import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import TenantGallery from './TenantGallery'

// 6 fotos: 1 principal + 4 thumbnails + la 6ta se resume en el badge "+1" del último thumbnail.
const PHOTOS = [
  '/bg-hero-desktop.png',
  '/bg-hero-2.png',
  '/bg-owner.png',
  '/bg-how-it-works.png',
  '/hero-bg.png',
  '/bg-hero-desktop.png',
]

/** En el perfil va plana, en la columna del complejo (`page.tsx`), debajo de las canchas. */
const meta = {
  title: 'Player/TenantProfile/TenantGallery',
  component: TenantGallery,
  parameters: { layout: 'padded' },
  args: { name: 'Complejo Fénix' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-background p-4">
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

/** 2 fotos: lado a lado en todos los anchos (apiladas en el celular quedaban dos tiras finas). */
export const DosFotos: Story = {
  args: { photos: PHOTOS.slice(0, 2) },
  play: async ({ canvasElement }) => {
    const [first, second] = within(canvasElement).getAllByRole('button')
    const a = first!.getBoundingClientRect()
    const b = second!.getBoundingClientRect()
    await expect(b.top).toBe(a.top)
    await expect(b.left).toBeGreaterThan(a.right)
  },
}

/** Varias fotos: foto principal + thumbnails, badge "+N" en la última. */
export const VariasFotos: Story = {
  args: { photos: PHOTOS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('+1')).toBeInTheDocument()
    // En el celular las miniaturas no entran: este botón (solo bajo 640 px, oculto acá) avisa y abre la galería.
    await expect(canvas.getByText('Ver 6 fotos')).toBeInTheDocument()
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
