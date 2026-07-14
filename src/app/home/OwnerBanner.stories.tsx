import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OwnerBanner } from './OwnerBanner'

/** CTA de cierre hacia `/para-complejos`. 100% estática, sin props. */
const meta = {
  title: 'Public/Landing/OwnerBanner',
  component: OwnerBanner,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="landing-hero min-h-dvh text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OwnerBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
