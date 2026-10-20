import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import { OwnersStrip } from './OwnersStrip'

const meta = {
  title: 'Public/Landing/OwnersStrip',
  component: OwnersStrip,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="bg-background text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof OwnersStrip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: /para complejos/i })
    await expect(link).toHaveAttribute('href', '/para-complejos')
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  },
}
