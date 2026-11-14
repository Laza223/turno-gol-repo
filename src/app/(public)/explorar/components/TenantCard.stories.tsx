import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { publicTenantCard, publicTenantCardSinReservaOnline } from '@/test/fixtures/tenant'
import { slotPill } from '@/test/fixtures/public'
import { withExplorar } from '../../../../../.storybook/decorators/with-explorar'
import TenantCard from './TenantCard'

const HOY = {
  date: '2026-03-14',
  pills: [slotPill({ time: '19:00' }), slotPill({ time: '20:00' }), slotPill({ time: '22:00' })],
  more: 3,
}

/** En /explorar va en la grilla `.ex-grid`: dos por fila en el celu. */
const meta = {
  title: 'Player/Explorar/TenantCard',
  component: TenantCard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="ex-grid">
        <Story />
      </div>
    ),
    withExplorar,
  ],
  args: {
    tenant: publicTenantCard({
      coverUrl: '/bg-hero-desktop.png',
      courtFormats: [5, 7],
      distanceKm: 1.2,
    }),
  },
} satisfies Meta<typeof TenantCard>

export default meta
type Story = StoryObj<typeof meta>

/** Con horarios libres de hoy: tres píldoras que reservan esa hora y "+3" que abre la ficha. */
export const ConHorarios: Story = {
  args: { today: HOY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Complejo Fénix' })).toBeInTheDocument()
    await expect(canvas.getByText('a 1,2 km · Fútbol 5 y 7')).toBeInTheDocument()
    const slot = canvas.getByRole('link', { name: 'Reservar a las 20:00' })
    await expect(slot.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await expect(
      canvas.getByRole('link', { name: 'Ver 3 horarios más de hoy' }),
    ).toBeInTheDocument()
  },
}

/** Hoy no le quedan horarios: lo dice y manda a la ficha. */
export const SinHorariosHoy: Story = {
  args: { today: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Hoy no le quedan horarios. Mirá otros días en su página.'),
    ).toBeInTheDocument()
  },
}

/** Sin reserva online: sin horarios, con la línea que lo explica. */
export const SinReservaOnline: Story = {
  args: { tenant: publicTenantCardSinReservaOnline(), today: HOY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: /Reservar a las/ })).not.toBeInTheDocument()
    await expect(
      canvas.getByText('No toma reservas online. En su página ves cómo reservar.'),
    ).toBeInTheDocument()
  },
}

/** Precios ocultos por el complejo: "Precio en su página". */
export const PrecioOculto: Story = {
  args: {
    tenant: publicTenantCard({ fromPriceCents: null, fromPricePerPlayerCents: null }),
    today: HOY,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Precio en su página')).toBeInTheDocument()
  },
}

/** Un nombre de 40 caracteres no rompe la tarjeta (dirección §5.12). Sin foto: las iniciales. */
export const NombreLargo: Story = {
  args: {
    tenant: publicTenantCard({ name: 'Complejo Deportivo Los Pibes del Oeste FC', coverUrl: null }),
    today: HOY,
  },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector('article')!
    await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
  },
}

/** variant=compact: la fila de la vista mapa. */
export const Compact: Story = {
  args: { variant: 'compact' },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { name: 'Complejo Fénix' }),
    ).toBeInTheDocument()
  },
}
