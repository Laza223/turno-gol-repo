import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import NotFound from './not-found'

/** 404 estático — sin props, sin lógica. Un solo estado real. */
const meta = {
  title: 'Layout/NotFoundPage',
  component: NotFound,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NotFound>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
