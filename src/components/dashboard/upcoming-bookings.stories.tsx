import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { DayBookingRow } from '@/app/(admin)/dashboard/dashboard-lib'
import { UpcomingBookings } from './upcoming-bookings'

/** Fila mínima de `DayBookingRow` — tipo local sin módulo de fixtures propio
 * (la page ya resuelve esta forma desde `queries.ts`, server-only). */
function row(overrides: Partial<DayBookingRow> = {}): DayBookingRow {
  return {
    id: 'booking-1',
    courtName: 'Cancha 1',
    timeStart: '16:00',
    timeEnd: '17:00',
    status: 'confirmed',
    type: 'spontaneous',
    depositStatus: 'paid',
    depositAmount: 450000,
    guestName: null,
    playerFirstName: 'Tomás',
    playerLastName: 'Ibáñez',
    priceSnapshot: 1500000,
    ...overrides,
  }
}

const meta = {
  title: 'Admin/Dashboard/UpcomingBookings',
  component: UpcomingBookings,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } },
  },
  decorators: [
    (Story) => (
      <div className="content-area-gradient max-w-2xl rounded-xl p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    nowHhmm: '15:30',
    openHhmm: '09:00',
    closesNextDay: false,
    dayIsClosed: false,
    playedToday: 1,
  },
} satisfies Meta<typeof UpcomingBookings>

export default meta
type Story = StoryObj<typeof meta>

/** Mezcla de badges (esperando/señada/abonado/confirmada) — el estado real de la tarde. */
export const Default: Story = {
  args: {
    upcoming: [
      row({ id: 'b-1', timeStart: '15:00', timeEnd: '16:00', status: 'pending_payment', depositStatus: 'pending', guestName: null, playerFirstName: null, playerLastName: null }),
      row({ id: 'b-2', timeStart: '16:00', timeEnd: '17:00', depositStatus: 'paid' }),
      row({ id: 'b-3', timeStart: '20:00', timeEnd: '21:00', type: 'fixed', depositAmount: 0, depositStatus: 'not_required', courtName: 'Cancha 2', playerFirstName: 'Julián', playerLastName: 'Álvarez' }),
      row({ id: 'b-4', timeStart: '18:00', timeEnd: '19:00', depositAmount: 0, depositStatus: 'not_required', playerFirstName: null, playerLastName: null, guestName: 'Grupo Los Pibes de Once', courtName: 'Cancha 3 - Fútbol 11', priceSnapshot: 1800000 }),
    ],
  },
}

/** Más de 6 turnos: se recortan a 6 y el resto queda en "N turnos más — ver grilla". */
export const ConOverflow: Story = {
  args: {
    upcoming: Array.from({ length: 9 }, (_, i) =>
      row({
        id: `overflow-${i}`,
        timeStart: `${15 + i}:00`,
        timeEnd: `${16 + i}:00`,
        playerFirstName: i % 2 === 0 ? 'Tomás' : 'Julián',
        playerLastName: i % 2 === 0 ? 'Ibáñez' : 'Álvarez',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('3 turnos más — ver grilla →')).toBeInTheDocument()
  },
}

/** Sin turnos por jugar, pero ya se jugaron algunos hoy. */
export const VacioNoQuedanTurnos: Story = {
  args: { upcoming: [], playedToday: 3 },
}

/** Sin turnos y ninguno jugado — día recién arrancando, sin reservas todavía. */
export const VacioSinReservas: Story = {
  args: { upcoming: [], playedToday: 0 },
}

/** Complejo cerrado hoy (feriado / día sin horario configurado). */
export const DiaCerrado: Story = {
  args: { upcoming: [], playedToday: 0, dayIsClosed: true },
}
