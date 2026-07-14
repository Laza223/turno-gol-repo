import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BookingCardMockup } from './BookingCardMockup'

/** Decorativo, `aria-hidden`, sin props — un único estado real. Solo visible en `lg:`. */
const meta = {
  title: 'Public/Landing/BookingCardMockup',
  component: BookingCardMockup,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="landing-hero flex min-h-[420px] items-center justify-center p-10 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BookingCardMockup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
