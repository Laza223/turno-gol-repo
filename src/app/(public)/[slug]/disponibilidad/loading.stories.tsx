import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import DisponibilidadLoading from './loading'

const meta = {
  title: 'Player/TenantProfile/DisponibilidadLoading',
  component: DisponibilidadLoading,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DisponibilidadLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo: 7 filas (un día c/u) con 8 turnos cada una. Sin variantes. */
export const Default: Story = {}
