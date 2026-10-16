import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import type { HourRow } from '@/lib/booking/hour-summary'
import { publicTenant, publicTenantNoOnlineBooking } from '@/test/fixtures/public'
import CourtRows from './CourtRows'

const courts = (count: number, price: number | null): HourRow['courts'] =>
  Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`,
    name: `Cancha ${i + 1}`,
    format: i % 2 === 0 ? 5 : 7,
    price,
  }))

const row = (count: number, price: number | null = 1500000): HourRow => ({
  time: '21:00',
  freeCount: count,
  state: count === 1 ? 'last' : 'free',
  courts: courts(count, price),
})

const meta = {
  title: 'Player/TenantProfile/CourtRows',
  component: CourtRows,
  parameters: { layout: 'fullscreen' },
  args: { tenant: publicTenant(), row: row(3), date: '2026-03-14' },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="mx-auto max-w-sm bg-background p-4 text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof CourtRows>

export default meta
type Story = StoryObj<typeof meta>

/** Con reserva online cada fila es un link a confirmar, con cancha, formato y precio. */
export const ConPrecios: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const links = canvas.getAllByRole('link')
    await expect(links).toHaveLength(3)
    await expect(links[0]).toHaveAttribute(
      'href',
      '/complejo-fenix/reservar?court=00000000-0000-4000-8000-000000000200&date=2026-03-14&time=21:00&dur=60',
    )
    await expect(links[1]).toHaveTextContent('Fútbol 7')
    await expect(links[0]).toHaveTextContent('15.000')
  },
}

/** `hidePrices`: aunque el slot traiga el precio, no se muestra ningún monto. */
export const PreciosOcultos: Story = {
  args: { tenant: publicTenant({ hidePrices: true }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).not.toContain('$')
  },
}

/** Sin reserva online cada fila abre WhatsApp con el pedido escrito. */
export const SinReservaOnline: Story = {
  args: { tenant: publicTenantNoOnlineBooking() },
  play: async ({ canvasElement }) => {
    const [first] = within(canvasElement).getAllByRole('link')
    await expect(first).toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\//))
    await expect(first).toHaveAttribute('target', '_blank')
    await expect(first).toHaveTextContent('WhatsApp')
  },
}

/** Sin WhatsApp válido se marca el teléfono. */
export const SinWhatsapp: Story = {
  args: {
    tenant: publicTenant({ allowOnlineBooking: false, whatsapp: null, phone: '4567-8900' }),
  },
  play: async ({ canvasElement }) => {
    const [first] = within(canvasElement).getAllByRole('link')
    await expect(first).toHaveAttribute('href', expect.stringMatching(/^tel:/))
    await expect(first).toHaveTextContent('Llamar')
  },
}

export const UnaCancha: Story = { args: { row: row(1) } }

export const DieciseisCanchas: Story = {
  args: { row: row(16) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('link')).toHaveLength(16)
  },
}
