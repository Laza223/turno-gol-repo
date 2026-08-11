import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'
import { uid } from '@/test/fixtures/ids'
import {
  BookingSuccessCard,
  BookingSuccessNotFound,
  type ConfirmedBooking,
} from './BookingSuccessCard'

const base: ConfirmedBooking = {
  tenantName: 'Complejo Fénix',
  tenantSlug: 'complejo-fenix',
  courtName: 'Cancha 1',
  address: 'Av. Rivadavia 4820',
  city: 'Ciudad Autónoma de Buenos Aires',
  // Sin geo: BookingSuccessExtras no monta el mapa (react-leaflet), evita red externa en la story.
  latitude: null,
  longitude: null,
  date: '2026-03-14',
  timeStart: '18:00',
  timeEnd: '19:00',
  priceSnapshot: 1500000,
  depositAmount: 450000,
  depositStatus: 'paid',
}

/**
 * `exito/page.tsx` vive dentro de `src/app/reserva/layout.tsx` → `PortalShell`
 * → `.player-shell-bg` (mint claro / `#020617` oscuro), con `<ReservaDarkShell>`
 * adentro. Sin el fondo del portal, "Seguir explorando" (emerald-700) cae
 * directo sobre `bg-background` (#e2e7ee) y da 4.41:1 — bajo AA (4.5). Con
 * `.player-shell-bg` (mint #ecfdf5) el mismo texto pasa.
 */
const meta = {
  title: 'Player/BookingResult/BookingSuccessCard',
  component: BookingSuccessCard,
  parameters: { layout: 'fullscreen' },
  args: {
    bookingId: uid(1001),
    verifyUrl: 'https://turnogol.app/reserva/00000000-0000-4000-8000-000000001001/verificar',
  },
  decorators: [
    (Story) => (
      <div className="player-shell-bg min-h-dvh">
        <ReservaDarkShell>
          <Story />
        </ReservaDarkShell>
      </div>
    ),
  ],
} satisfies Meta<typeof BookingSuccessCard>

export default meta
type Story = StoryObj<typeof meta>

/** Con seña pagada: muestra el monto de la seña + lo que resta abonar en el complejo. */
export const ConSena: Story = {
  args: { booking: base },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: /reserva confirmada/i })).toBeInTheDocument()
    // "$ 4.500" (seña) y "$ 10.500" (resto) son el textContent EXACTO de un <span>
    // propio, sin hijos — un match exacto no ambigua con ningún ancestro.
    // formatArs separa "$" del monto con NBSP; getByText normaliza a espacio común.
    await expect(canvas.getByText('$ 4.500')).toBeInTheDocument()
    await expect(canvas.getByText('$ 10.500')).toBeInTheDocument()
  },
}

/** Sin seña (`requires_deposit: false` o pago 100% presencial): se abona el total en el complejo. */
export const SinSena: Story = {
  args: { booking: { ...base, depositAmount: 0, depositStatus: 'not_required' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/al llegar al complejo/i)).toBeInTheDocument()
    await expect(canvas.queryByText('$ 4.500')).not.toBeInTheDocument()
  },
}

/** Sin reserva encontrada (inexistente, purgada, o de otro jugador via RLS). */
export const NoEncontrada: StoryObj<typeof BookingSuccessNotFound> = {
  render: () => <BookingSuccessNotFound />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No encontramos tu reserva.')).toBeInTheDocument()
  },
}
