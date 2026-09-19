import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { TodayBoard } from './TodayBoard'
import { buildTodayBoard, type BoardBooking, type BoardCourt } from '@/lib/dashboard/today-board'

/**
 * "Turnos de hoy": una columna por cancha con tres tipos de fila — sin cobrar
 * (arriba, borde rojo, nunca plegadas), en juego (la única teñida) y próximos.
 * Cada fila es un botón que abre el modal de cobro.
 *
 * Reloj FIJO y no `Date.now()`: "Terminó hace 5 min" y "en 55 min" son parte de
 * lo que las stories aseveran, y con el reloj real cambian en cada corrida.
 * Viernes 18/09/2026, 21:05 en Argentina (UTC-3).
 */
const DAY = '2026-09-18'
const art = (hhmm: string, day = DAY): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return Date.parse(`${day}T00:00:00Z`) + ((h ?? 0) + 3) * 3_600_000 + (m ?? 0) * 60_000
}
const NOW_MS = art('21:05')

function turno(over: Partial<BoardBooking> & { id: string; start: string; end: string }) {
  const { start, end, ...rest } = over
  return {
    courtId: 'c1',
    date: DAY,
    timeStart: start,
    timeEnd: end,
    startsAtMs: art(start),
    endsAtMs: end === '24:00' ? art('24:00') : art(end),
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: 'Juan',
    playerLastName: 'Pérez',
    priceSnapshot: 6_000_000,
    depositStatus: 'not_required',
    depositAmount: 0,
    totalPaid: 0,
    pending: 6_000_000,
    ...rest,
  } as BoardBooking
}

const COURTS: BoardCourt[] = [
  { id: 'c1', name: 'Cancha 1', status: 'online', capacity: 10 },
  { id: 'c2', name: 'Cancha 2', status: 'online', capacity: 10 },
  { id: 'c3', name: 'Cancha 3', status: 'offline', capacity: 10 },
  { id: 'c4', name: 'Cancha 4', status: 'online', capacity: 14 },
]

const VIERNES: BoardBooking[] = [
  // Cancha 1: uno sin cobrar (con cobro parcial), uno en juego pagado, dos por venir.
  turno({
    id: 'c1-pablo',
    start: '19:00',
    end: '20:00',
    playerFirstName: 'Pablo',
    playerLastName: 'Ruiz',
    totalPaid: 2_400_000,
    pending: 3_600_000,
  }),
  turno({
    id: 'c1-lucia',
    start: '20:00',
    end: '21:00',
    playerFirstName: 'Lucía',
    playerLastName: 'Méndez',
  }),
  turno({
    id: 'c1-diego',
    start: '21:00',
    end: '22:00',
    playerFirstName: 'Diego',
    playerLastName: 'Sosa',
    totalPaid: 6_000_000,
    pending: 0,
  }),
  turno({
    id: 'c1-marcos',
    start: '22:00',
    end: '23:00',
    playerFirstName: 'Marcos',
    playerLastName: 'Gil',
  }),
  turno({
    id: 'c1-sofia',
    start: '23:00',
    end: '24:00',
    playerFirstName: 'Sofía',
    playerLastName: 'Vera',
    status: 'pending_payment',
  }),
  // Cancha 2: uno sin cobrar y uno en juego con saldo.
  turno({
    id: 'c2-ana',
    courtId: 'c2',
    start: '20:00',
    end: '21:00',
    playerFirstName: 'Ana',
    playerLastName: 'López',
    totalPaid: 1_000_000,
    pending: 5_000_000,
  }),
  turno({
    id: 'c2-tomas',
    courtId: 'c2',
    start: '21:00',
    end: '22:00',
    playerFirstName: 'Tomás',
    playerLastName: 'García',
  }),
  // Cancha 3 (pausada): un turno de hoy que se jugó y quedó sin cobrar.
  turno({
    id: 'c3-rocio',
    courtId: 'c3',
    start: '19:00',
    end: '20:00',
    playerFirstName: 'Rocío',
    playerLastName: 'Paz',
  }),
  // Lo que NO debe aparecer: pagado y terminado, ausente, bloqueo.
  turno({
    id: 'c4-pagado',
    courtId: 'c4',
    start: '18:00',
    end: '19:00',
    pending: 0,
    totalPaid: 6_000_000,
  }),
  turno({ id: 'c4-ausente', courtId: 'c4', start: '19:00', end: '20:00', status: 'no_show' }),
  turno({ id: 'c4-bloqueo', courtId: 'c4', start: '20:00', end: '21:00', type: 'block' }),
]

const OCCUPANCY = { occupied: 8, available: 28, blocked: 1, pct: 29 }

const meta = {
  title: 'Admin/Dashboard/TodayBoard',
  component: TodayBoard,
  parameters: { layout: 'padded' },
  args: {
    nowMs: NOW_MS,
    occupancy: OCCUPANCY,
    dayIsClosed: false,
    canManageCourts: true,
    onOpenBooking: fn(),
    columns: buildTodayBoard(VIERNES, COURTS, NOW_MS),
  },
} satisfies Meta<typeof TodayBoard>

export default meta
type Story = StoryObj<typeof meta>

/** El viernes a las 21:05: lo que hay que cobrar arriba, lo que se juega teñido. */
export const Viernes2105: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Turnos de hoy')).toBeVisible()
    // Los sin cobrar dicen cuánto falta, hace cuánto terminaron y cuánta gente ya pagó.
    await expect(canvas.getAllByText(/Terminó hace 5 min/).length).toBeGreaterThan(0)
    await expect(canvas.getByText(/Pagaron 4 de 10/)).toBeVisible()
    // La cancha pausada aparece solo por su turno sin cobrar.
    await expect(canvas.getByText('Pausada')).toBeVisible()
    // Pagado / ausente / bloqueo no están.
    await expect(canvas.queryByText('Cancha 4')).toBeVisible()
    await expect(canvas.getByText('Libre el resto del día.')).toBeVisible()
    // Cada fila es UN botón que abre el modal, no un link a otra pantalla.
    await userEvent.click(canvas.getByRole('button', { name: /Lucía Méndez/ }))
    await expect(args.onOpenBooking).toHaveBeenCalledWith('c1-lucia')
    await expect(canvas.queryByRole('link', { name: /Lucía/ })).toBeNull()
  },
}

/** Con más de cuatro turnos por venir se pliegan, pero los sin cobrar NUNCA. */
export const VerMasNoEscondeLoSinCobrar: Story = {
  args: {
    columns: buildTodayBoard(
      [
        turno({
          id: 'deuda',
          start: '18:00',
          end: '19:00',
          playerFirstName: 'Deuda',
          playerLastName: 'Vieja',
        }),
        ...['22:00', '23:00'].map((h, i) =>
          turno({
            id: `p${i}`,
            start: h,
            end: h === '23:00' ? '24:00' : '23:00',
            playerFirstName: `Futuro${i}`,
          }),
        ),
        ...['21:00'].map((h) =>
          turno({ id: 'live', start: h, end: '22:00', playerFirstName: 'EnJuego' }),
        ),
        turno({ id: 'p2', start: '22:30', end: '23:30', playerFirstName: 'Futuro2' }),
        turno({ id: 'p3', start: '22:45', end: '23:45', playerFirstName: 'Futuro3' }),
      ],
      COURTS,
      NOW_MS,
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Deuda/)).toBeVisible()
    const more = canvas.getByRole('button', { name: /Ver \d+ más/ })
    await userEvent.click(more)
    await expect(canvas.getByRole('button', { name: 'Ver menos' })).toBeVisible()
  },
}

export const TodoCobrado: Story = {
  args: {
    columns: buildTodayBoard(
      [turno({ id: 'p', start: '18:00', end: '19:00', pending: 0, totalPaid: 6_000_000 })],
      COURTS.filter((c) => c.status === 'online'),
      NOW_MS,
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No queda nada por jugar ni por cobrar hoy.')).toBeVisible()
  },
}

export const DiaCerrado: Story = {
  args: { columns: buildTodayBoard([], COURTS, NOW_MS), dayIsClosed: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Hoy el complejo está cerrado.')).toBeVisible()
  },
}

/** Con todas las canchas pausadas el dueño puede ir a activarlas... */
export const SinCanchasParaElDueno: Story = {
  args: { columns: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No hay ninguna cancha en servicio.')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ir a Canchas' })).toBeVisible()
  },
}

/** ...pero el Encargado no ve un link a una pantalla que lo rebota. */
export const SinCanchasParaElEncargado: Story = {
  args: { columns: [], canManageCourts: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Pedile al dueño que active una/)).toBeVisible()
    await expect(canvas.queryByRole('link', { name: 'Ir a Canchas' })).toBeNull()
  },
}
