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
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Mientras no estabas')).toBeVisible()
    // El encabezado ya contesta sin desplegar nada: ése es el punto del
    // rediseño del 2026-09-12.
    await expect(
      canvas.getByText('1 reserva online · 1 seña acreditada · 1 cancelación'),
    ).toBeVisible()
    // El default depende del viewport (abierto en escritorio, plegado en
    // teléfono), así que la story no puede asumir uno: lleva el toggle al
    // estado abierto y recién ahí cuenta.
    const toggle = canvas.getByRole('button', { name: /Mientras no estabas/ })
    if (toggle.getAttribute('aria-expanded') !== 'true') await userEvent.click(toggle)
    await expect(canvas.getAllByRole('link')).toHaveLength(3)
    await userEvent.click(toggle)
    await expect(canvas.queryAllByRole('link')).toHaveLength(0)
  },
}

export const Vacio: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nada nuevo desde la última vez.')).toBeVisible()
    // Sin eventos no hay nada que desplegar: el toggle queda inerte en vez de
    // abrir una lista vacía.
    await expect(canvas.getByRole('button', { name: /Mientras no estabas/ })).toBeDisabled()
  },
}
