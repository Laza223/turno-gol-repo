import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { playerTenantLinks } from '../../_components/player-fixtures'
import { PlayerTenantsCard } from './player-tenants-card'

const meta = {
  title: 'SuperAdmin/Jugadores/PlayerTenantsCard',
  component: PlayerTenantsCard,
  parameters: { layout: 'padded' },
  args: { tenants: playerTenantLinks() },
} satisfies Meta<typeof PlayerTenantsCard>

export default meta
type Story = StoryObj<typeof meta>

/** Un complejo que lo bloqueó (con etiquetas) y otro sin movimiento. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Bloqueado por el complejo')).toBeInTheDocument()
    await expect(canvas.getByText('No fiar')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'El Vagón' })).toHaveAttribute(
      'href',
      '/super-admin/tenants/9a0b7c20-2222-4b2c-9d22-0000000000a1',
    )
  },
}

export const SinComplejos: Story = {
  args: { tenants: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Todavía no reservó en ningún complejo.'),
    ).toBeInTheDocument()
  },
}
