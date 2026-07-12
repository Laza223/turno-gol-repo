import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import TenantProfileLoading from './loading'

const meta = {
  title: 'Player/TenantProfile/ProfileLoading',
  component: TenantProfileLoading,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TenantProfileLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo del perfil público: hero + header + grilla. Sin variantes. */
export const Default: Story = {}
