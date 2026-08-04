import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { WhileYouWereAway } from './WhileYouWereAway'
import type { WhileAwayItem } from '@/modules/home/home.types'

const meta = {
  title: 'Admin/Dashboard/WhileYouWereAway',
  component: WhileYouWereAway,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WhileYouWereAway>

export default meta
type Story = StoryObj<typeof meta>

const items: WhileAwayItem[] = [
  {
    kind: 'booking_online',
    bookingId: 'b1',
    at: new Date('2026-08-02T21:30:00Z'),
    courtName: 'Cancha 1',
    timeLabel: '20:00-21:00',
    contactName: 'Tomás García',
  },
  {
    kind: 'deposit_paid',
    bookingId: 'b2',
    at: new Date('2026-08-02T20:10:00Z'),
    amountCents: 750000,
    courtName: 'Cancha 2',
    contactName: 'Rodrigo Paz',
  },
  {
    kind: 'cancellation',
    bookingId: 'b3',
    at: new Date('2026-08-02T18:00:00Z'),
    courtName: 'Cancha 1',
    timeLabel: '22:00-23:00',
    contactName: 'Ana López',
  },
]

export const ConEventos: Story = {
  args: { items },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Mientras no estabas')).toBeVisible()
    await expect(canvas.getAllByRole('link')).toHaveLength(3)
  },
}

export const Vacio: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nada nuevo desde la última vez.')).toBeVisible()
  },
}
