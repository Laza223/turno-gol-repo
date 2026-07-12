import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { StatsBar } from './StatsBar'

/** 100% estática (4 stats fijos, sin props) — un único estado real. */
const meta = {
  title: 'Public/Landing/StatsBar',
  component: StatsBar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="landing-hero min-h-dvh text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatsBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
