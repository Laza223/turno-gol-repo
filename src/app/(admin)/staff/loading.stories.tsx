import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import StaffLoading from './loading'

/** Skeleton único de /staff: banda de header + tabla de 4 filas. */
const meta = {
  title: 'Admin/Staff/Loading',
  component: StaffLoading,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StaffLoading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
