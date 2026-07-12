import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import StaffError from './error'

const meta = {
  title: 'Admin/Staff/Error',
  component: StaffError,
  parameters: { layout: 'fullscreen' },
  args: {
    reset: fn(),
  },
} satisfies Meta<typeof StaffError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    error: Object.assign(new Error('failed to fetch staff roster'), { digest: undefined }),
  },
}

export const ConDigest: Story = {
  args: {
    error: Object.assign(new Error('connection terminated unexpectedly'), {
      digest: '5029183746',
    }),
  },
}
