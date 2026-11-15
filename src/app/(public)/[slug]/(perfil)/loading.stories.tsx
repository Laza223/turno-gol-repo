import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import TenantProfileLoading from './loading'

const meta = {
  title: 'Player/TenantProfile/ProfileLoading',
  component: TenantProfileLoading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TenantProfileLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo del perfil público: tarjeta de vidrio, reserva y tiles. Sin variantes. */
export const Default: Story = {}
