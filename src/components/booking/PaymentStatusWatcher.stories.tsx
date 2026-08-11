import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import { minutesFromNow } from '@/test/fixtures/clock'
import ReservaDarkShell from './ReservaDarkShell'
import PaymentStatusWatcher from './PaymentStatusWatcher'

const bookingId = 'b1a2c3d4-0001-4000-8000-000000000001'

/**
 * Vive en `reserva/[bookingId]/exito/page.tsx` cuando el jugador vuelve de MP
 * antes de que llegue el webhook — siempre dentro de ReservaDarkShell + el
 * mismo `max-w-md ... text-center` que la página de éxito.
 *
 * Los estados TERMINALES (confirmed/expired/canceled_*) cortan los 3 `useEffect`
 * en la primera línea (`if (TERMINAL_STATUSES.has(status)) return`), así que
 * ninguno agenda un fetch — no hace falta `fetchMock` para esas stories. El
 * estado por defecto (pending) sí agenda un poll real a los 3s: se le da una
 * ruta mockeada igual, para no pisar la consola con "fetch no mockeado" si
 * alguien deja la story abierta.
 *
 * `stalled='error'` (5 fallos de polling con backoff 3s→30s) no se ejerce acá:
 * el camino real tarda ~75s de timers reales de principio a fin, impracticable
 * en un `play`. `stalled='expired'` sí es demostrable (el efecto de expiración
 * corre sync cuando `expiresAt` ya pasó, sin esperar el timer del poll).
 */
const meta = {
  title: 'Player/BookingSuccess/PaymentStatusWatcher',
  component: PaymentStatusWatcher,
  parameters: {
    layout: 'fullscreen',
    fetchMock: [
      {
        match: `/api/player/bookings/${bookingId}/status`,
        json: {
          data: {
            status: 'pending_payment',
            depositStatus: 'pending',
            expiresAt: minutesFromNow(6).toISOString(),
          },
        },
      },
    ],
  },
  args: {
    bookingId,
    initialStatus: 'pending_payment',
    expiresAt: minutesFromNow(6).toISOString(),
  },
  decorators: [
    (Story) => (
      <ReservaDarkShell>
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
          <Story />
        </div>
      </ReservaDarkShell>
    ),
  ],
} satisfies Meta<typeof PaymentStatusWatcher>

export default meta
type Story = StoryObj<typeof meta>

/** Default: pending_payment — spinner + ExpiryCountdown, sin aviso de demora todavía. */
export const Confirmando: Story = {}

export const Confirmada: Story = {
  args: { initialStatus: 'confirmed' },
}

export const Expirada: Story = {
  name: 'expired — el turno quedó liberado',
  args: { initialStatus: 'expired' },
}

/** canceled_refunded y canceled_no_refund renderizan el mismo bloque. */
export const Cancelada: Story = {
  args: { initialStatus: 'canceled_refunded' },
}

export const TiempoAgotado: Story = {
  name: 'stalled=expired — expiresAt ya venció, sin transición terminal',
  args: { expiresAt: minutesFromNow(-10).toISOString() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('Se acabó el tiempo')).toBeInTheDocument())
  },
}
