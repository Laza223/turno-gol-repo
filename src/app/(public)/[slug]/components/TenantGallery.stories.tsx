import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import TenantGallery from './TenantGallery'

// 6 fotos: todas en la tira, una tarjeta por foto.
const PHOTOS = [
  '/bg-hero-desktop.png',
  '/bg-hero-2.png',
  '/bg-owner.png',
  '/bg-how-it-works.png',
  '/hero-bg.png',
  '/bg-hero-desktop.png',
]

/** En el perfil va en la columna del complejo, debajo de las canchas: tira con snap en el celu. */
const meta = {
  title: 'Player/TenantProfile/TenantGallery',
  component: TenantGallery,
  parameters: { layout: 'padded' },
  args: { name: 'Complejo Fénix' },
  decorators: [
    (Story) => (
      <div data-portal-glass className="portal-ambient p-4 text-portal-ink">
        <div className="max-w-2xl">
          <Story />
        </div>
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

/** 1 sola foto: una tarjeta. */
export const UnaFoto: Story = {
  args: { photos: [PHOTOS[0]!] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('button')).toHaveLength(1)
  },
}

/** Varias fotos: una tarjeta por foto (la tira se desliza en el celu y son 3 columnas desde 1024 px). */
export const VariasFotos: Story = {
  args: { photos: PHOTOS },
  play: async ({ canvasElement }) => {
    const buttons = within(canvasElement).getAllByRole('button')
    await expect(buttons).toHaveLength(6)
    await expect(getComputedStyle(buttons[0]!.closest('ul')!).scrollSnapType).toContain('x')
  },
}

/** Click en una foto abre el lightbox: navegación por teclado (← / → / Esc). */
export const LightboxAbierto: Story = {
  args: { photos: PHOTOS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('img', { name: /foto 1$/i }))

    const dialog = within(canvas.getByRole('dialog', { name: /fotos de complejo fénix/i }))
    await expect(dialog.getByText('1 / 6')).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Foto siguiente' }))
    await expect(dialog.getByText('2 / 6')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
