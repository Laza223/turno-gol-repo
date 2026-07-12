import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ReportesLoading from './loading'

const meta = {
  title: 'Admin/Reportes/Loading',
  component: ReportesLoading,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ReportesLoading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
