import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { artDateString } from '@/test/fixtures/clock'
import { uid } from '@/test/fixtures/ids'
import type { ReservaListRow } from './queries'
import { CourtBoard } from './CourtBoard'

const SUCCESS = { success: true as const, booking: {} as never }

const ACTIONS = {
  cancelBookingAction: fn(async () => SUCCESS),
  completeAndChargeBookingAction: fn(async () => SUCCESS),
  confirmDepositPaymentAction: fn(async () => SUCCESS),
  markNoShowAction: fn(async () => SUCCESS),
}

let bookingSeq = 0
function row(overrides: Partial<ReservaListRow> & { courtName: string }): ReservaListRow {
  bookingSeq += 1
  return {
    id: uid(1200 + bookingSeq),
    date: artDateString(),
    timeStart: '19:00',
    timeEnd: '20:00',
    status: 'confirmed',
    type: 'spontaneous',
    playerName: 'Julián Álvarez',
    guestName: null,
    priceSnapshot: 1_500_000,
    depositAmount: 450_000,
    depositStatus: 'paid',
    paymentMethod: 'mercadopago',
    ...overrides,
  }
}

const meta = {
  title: 'Admin/Reservas/CourtBoard',
  component: CourtBoard,
  parameters: { layout: 'fullscreen' },
  args: { actions: ACTIONS, scope: 'hoy' },
  decorators: [
    (Story) => (
      <div className="h-[560px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CourtBoard>

export default meta
type Story = StoryObj<typeof meta>

const COURT_1 = { id: uid(101), name: 'Cancha 1' }
const COURT_2 = { id: uid(102), name: 'Cancha 2' }

/** Una cancha con varios turnos (scrollea sola) y otra vacía ("Sin reservas") — nunca se empujan entre sí. */
export const DosCanchas: Story = {
  args: {
    courts: [COURT_1, COURT_2],
    bookings: [
      row({ courtName: COURT_1.name, timeStart: '08:00', timeEnd: '09:00' }),
      row({
        courtName: COURT_1.name,
        timeStart: '09:00',
        timeEnd: '10:00',
        guestName: 'Ana López',
        playerName: null,
      }),
      row({ courtName: COURT_1.name, timeStart: '10:00', timeEnd: '11:00' }),
      row({ courtName: COURT_1.name, timeStart: '14:00', timeEnd: '15:00' }),
      row({ courtName: COURT_1.name, timeStart: '19:00', timeEnd: '20:00' }),
      row({ courtName: COURT_1.name, timeStart: '20:00', timeEnd: '21:00' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cancha1 = within(canvas.getByRole('region', { name: COURT_1.name }))
    await expect(cancha1.getAllByRole('article')).toHaveLength(6)
    const cancha2 = within(canvas.getByRole('region', { name: COURT_2.name }))
    await expect(cancha2.getByText('Sin reservas')).toBeVisible()
  },
}

/** 8 canchas: el tablero scrollea horizontalmente en vez de apilar 8 secciones verticales. */
export const OchoCanchas: Story = {
  args: {
    courts: Array.from({ length: 8 }, (_, i) => ({
      id: uid(110 + i),
      name: `Cancha ${i + 1}`,
    })),
    bookings: [
      row({ courtName: 'Cancha 1' }),
      row({ courtName: 'Cancha 3', timeStart: '10:00', timeEnd: '11:00' }),
      row({ courtName: 'Cancha 8', timeStart: '21:00', timeEnd: '22:00' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (let i = 1; i <= 8; i++) {
      await expect(canvas.getByRole('region', { name: `Cancha ${i}` })).toBeInTheDocument()
    }
  },
}

/** Próximas: separadores de día adentro de cada columna, orden cronológico. */
export const ProximasConSeparadoresDeDia: Story = {
  args: {
    scope: 'proximas',
    courts: [COURT_1],
    bookings: [
      row({ courtName: COURT_1.name, date: '2026-03-15', timeStart: '18:00', timeEnd: '19:00' }),
      row({ courtName: COURT_1.name, date: '2026-03-16', timeStart: '09:00', timeEnd: '10:00' }),
      row({ courtName: COURT_1.name, date: '2026-03-16', timeStart: '20:00', timeEnd: '21:00' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cancha1 = within(canvas.getByRole('region', { name: COURT_1.name }))
    await expect(cancha1.getAllByRole('article')).toHaveLength(3)
  },
}
