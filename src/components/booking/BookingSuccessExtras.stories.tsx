import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { tenant } from '@/test/fixtures/tenant'
import { PORTAL_COLUMN } from '@/components/world/PortalAuthFrame'
import BookingSuccessExtras from './BookingSuccessExtras'

const t = tenant()

/**
 * Las secundarias de la reserva confirmada: una lista plana de filas de 48 px (Cómo llegar, Agregar
 * al calendario, Ver mis reservas), debajo de "Avisarle al grupo". Cada fila dice su acción;
 * ninguna compite con la principal.
 */
const meta = {
  title: 'Player/BookingSuccess/BookingSuccessExtras',
  component: BookingSuccessExtras,
  parameters: { layout: 'fullscreen' },
  args: {
    tenantName: t.name,
    courtName: 'Cancha 1',
    slug: t.slug,
    startsOn: '2026-03-14',
    timeStart: '16:00',
    timeEnd: '17:00',
    address: t.address,
    city: t.city,
    latitude: null,
    longitude: null,
  },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background text-foreground">
        <div className={PORTAL_COLUMN}>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof BookingSuccessExtras>

export default meta
type Story = StoryObj<typeof meta>

/** Con dirección y sin coordenadas: "Cómo llegar" busca la dirección escrita. */
export const ConDireccion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Cómo llegar' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Agregar al calendario' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
  },
}

/** Sin dirección ni coordenadas no hay "Cómo llegar": quedan el calendario y Mis reservas. */
export const SinUbicacion: Story = {
  args: { address: '', latitude: null, longitude: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Cómo llegar' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Agregar al calendario' })).toBeInTheDocument()
  },
}

export const ComoLlegar: Story = {
  name: 'El link "Cómo llegar" apunta a Google Maps con las coordenadas',
  args: { latitude: -34.6083, longitude: -58.4386 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', { name: 'Cómo llegar' })
    await expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=-34.6083,-58.4386',
    )
  },
}
