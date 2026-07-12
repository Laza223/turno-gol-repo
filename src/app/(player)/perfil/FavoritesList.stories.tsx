import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { publicTenantCard, publicTenantCardSinResenas } from '@/test/fixtures/tenant'
import FavoritesList from './FavoritesList'

/**
 * `PublicTenantCard` (@/modules/tenants/search.service) es un `.service.ts`:
 * ni siquiera se puede `import type` en stories (no-restricted-imports lo
 * bloquea entero). `publicTenantCard()` en tenant.ts fixture es el shape a
 * mano equivalente — TypeScript lo acepta por tipado estructural contra la
 * prop de FavoritesList sin necesidad de importar el tipo acá.
 */
const meta = {
  title: 'Player/Perfil/FavoritesList',
  component: FavoritesList,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FavoritesList>

export default meta
type Story = StoryObj<typeof meta>

export const SinFavoritos: Story = {
  args: { tenants: [], photosByTenant: {} },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin favoritos todavía')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /explorar complejos/i })).toHaveAttribute(
      'href',
      '/explorar',
    )
  },
}

export const ConFavoritos: Story = {
  args: {
    tenants: [publicTenantCard(), publicTenantCardSinResenas()],
    photosByTenant: {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: /complejo fénix/i })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /canchas del sur/i })).toBeInTheDocument()
  },
}
