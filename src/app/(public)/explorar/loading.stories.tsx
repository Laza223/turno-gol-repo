import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ExplorarLoading from './loading'

const meta = {
  title: 'Player/Explorar/ExplorarLoading',
  component: ExplorarLoading,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ExplorarLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo: banda hero + toolbar + sidebar de filtros + 6 cards. */
export const Default: Story = {}
