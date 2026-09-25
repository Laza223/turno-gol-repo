import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { CourtBoard, EarlierUnpaidBanner, type EarlierBooking, type QueueCourt } from './CourtBoard'
import { buildCourtBoard, type BoardBooking } from '@/lib/dashboard/today-board'

/**
 * El tablero de Hoy: una tarjeta por cancha con un turno cada una. La que tiene
 * un turno jugado y sin cobrar va en rojo con "Cobrar $X"; si no, el que se
 * juega; si no, el próximo. Cada tarjeta es un botón que abre el modal de cobro.
 *
 * Reloj FIJO y no `Date.now()`: "Terminó hace 5 min" es parte de lo que las
 * stories aseveran, y con el reloj real cambia en cada corrida.
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
  const day = rest.date ?? DAY
  return {
    courtId: 'c1',
    date: DAY,
    timeStart: start,
    timeEnd: end,
    startsAtMs: art(start, day),
    endsAtMs: art(end, day),
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: 'Juan',
    playerLastName: 'Pérez',
    priceSnapshot: 8_400_000,
    depositStatus: 'not_required',
    depositAmount: 0,
    totalPaid: 0,
    pending: 8_400_000,
    ...rest,
  } as BoardBooking
}

const COURTS: QueueCourt[] = [
  { id: 'c1', name: 'Cancha 1', status: 'online', capacity: 14 },
  { id: 'c2', name: 'Cancha 2', status: 'online', capacity: 14 },
  { id: 'c3', name: 'Cancha 3', status: 'offline', capacity: 10 },
  { id: 'c4', name: 'Cancha 4', status: 'online', capacity: 10 },
]

const VIERNES: BoardBooking[] = [
  // Terminaron sin cobrarse: el de las 20 en dos canchas (uno a medias) y uno de las 18.
  turno({
    id: 'c1-lucia',
    start: '20:00',
    end: '21:00',
    playerFirstName: 'Lucía',
    playerLastName: 'Méndez',
  }),
  turno({
    id: 'c2-ana',
    courtId: 'c2',
    start: '20:00',
    end: '21:00',
    playerFirstName: 'Ana',
    playerLastName: 'López',
    totalPaid: 4_200_000,
    pending: 4_200_000,
  }),
  turno({
    id: 'c3-rocio',
    courtId: 'c3',
    start: '18:00',
    end: '19:00',
    playerFirstName: 'Rocío',
    playerLastName: 'Paz',
    priceSnapshot: 6_000_000,
    pending: 6_000_000,
  }),
  // Se están jugando: uno debe todo, el otro ya pagó (no aparece).
  turno({
    id: 'c1-diego',
    start: '21:00',
    end: '22:00',
    playerFirstName: 'Diego',
    playerLastName: 'Sosa',
  }),
  turno({
    id: 'c4-pagado',
    courtId: 'c4',
    start: '21:00',
    end: '22:00',
    pending: 0,
    totalPaid: 6_000_000,
  }),
  // Lo que viene (no se muestra mientras haya algo para cobrar).
  turno({ id: 'c1-marcos', start: '22:00', end: '23:00', playerFirstName: 'Marcos' }),
  // Nunca aparecen: ausente y bloqueo.
  turno({ id: 'c4-ausente', courtId: 'c4', start: '19:00', end: '20:00', status: 'no_show' }),
  turno({ id: 'c4-bloqueo', courtId: 'c4', start: '20:00', end: '21:00', type: 'block' }),
]

const meta = {
  title: 'Admin/Dashboard/CourtBoard',
  component: CourtBoard,
  parameters: { layout: 'padded' },
  args: {
    board: buildCourtBoard(VIERNES, COURTS, NOW_MS),
    courts: COURTS,
    nowMs: NOW_MS,
    dayIsClosed: false,
    canManageCourts: true,
    onOpenBooking: fn(),
  },
} satisfies Meta<typeof CourtBoard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Un viernes a las 21:05: la Cancha 1 y la 2 tienen un turno que terminó sin
 * cobrarse (rojo, "Cobrar $X"); la 3 está pausada pero debe plata, así que
 * aparece igual; la 4 se está jugando y ya pagó.
 */
export const Tablero: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/3 sin cobrar/)).toBeVisible()
    await expect(canvas.getAllByText('Cobrar')).toHaveLength(3)

    const lucia = canvas.getByRole('button', { name: /Lucía Méndez/ })
    await expect(lucia).toHaveTextContent('Terminó hace 5 min')
    // Diego se está jugando en la misma cancha y también debe: se cuenta, no se lista.
    await expect(lucia).toHaveTextContent('+1 más por cobrar')
    await expect(canvas.queryByRole('button', { name: /Diego/ })).toBeNull()
    await expect(canvas.getByRole('button', { name: /Rocío Paz/ })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Cancha 4/ })).toHaveTextContent('Pagado')

    await userEvent.click(lucia)
    await expect(args.onOpenBooking).toHaveBeenCalledWith('c1-lucia')
  },
}

/** Nada para cobrar: cada cancha muestra el que se juega o el próximo, sin rojo. */
export const SinNadaParaCobrar: Story = {
  args: {
    board: buildCourtBoard(
      VIERNES.filter((b) => b.status === 'confirmed' && b.startsAtMs > NOW_MS),
      COURTS,
      NOW_MS,
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Cobrar')).toBeNull()
    await expect(canvas.getByRole('button', { name: /Marcos/ })).toHaveTextContent(
      'Empieza en 55 min',
    )
    await expect(canvas.getAllByText('Sin más turnos hoy').length).toBeGreaterThan(0)
  },
}

/** Doce canchas: entran en tres columnas sin desplazar la tarjeta. */
export const DoceCanchas: Story = {
  args: (() => {
    const courts: QueueCourt[] = Array.from({ length: 12 }, (_, i) => ({
      id: `k${i + 1}`,
      name: `Cancha ${i + 1}`,
      status: 'online',
      capacity: 14,
    }))
    const bookings = courts.map((c, i) =>
      turno({
        id: `t-${c.id}`,
        courtId: c.id,
        start: i % 3 === 0 ? '20:00' : '21:00',
        end: i % 3 === 0 ? '21:00' : '22:00',
        guestName: `Equipo ${i + 1}`,
        ...(i % 3 === 1 ? { pending: 0, totalPaid: 8_400_000 } : {}),
      }),
    )
    return { courts, board: buildCourtBoard(bookings, courts, NOW_MS) }
  })(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(12)
    await expect(canvas.getAllByText('Cobrar')).toHaveLength(4)
  },
}

export const DiaCerrado: Story = {
  args: { board: buildCourtBoard([], COURTS, NOW_MS), dayIsClosed: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Hoy el complejo está cerrado.')).toBeVisible()
  },
}

export const SinCanchasParaElDueno: Story = {
  args: { board: buildCourtBoard([], [], NOW_MS), courts: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No hay ninguna cancha en servicio.')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ir a Canchas' })).toBeVisible()
  },
}

export const SinCanchasParaElEncargado: Story = {
  args: { board: buildCourtBoard([], [], NOW_MS), courts: [], canManageCourts: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Pedile al dueño que active una/)).toBeVisible()
    await expect(canvas.queryByRole('link', { name: 'Ir a Canchas' })).toBeNull()
  },
}

const NOMBRES = ['Los Pibes', 'Martín Díaz', 'Fútbol del jueves', 'Nico', 'Ale', 'Gonza', 'Tito']

const EARLIER: EarlierBooking[] = NOMBRES.map((name, i) => ({
  ...turno({
    id: `antes-${i}`,
    courtId: i % 2 === 0 ? 'c1' : 'c2',
    date: i < 2 ? '2026-09-17' : '2026-09-15',
    start: '21:00',
    end: '22:00',
    guestName: name,
    status: 'completed',
    ...(i === 1 ? { totalPaid: 4_200_000, pending: 4_200_000 } : {}),
  }),
  dayLabel: i < 2 ? 'ayer' : 'mar 15 de septiembre',
}))

/**
 * Lo de días anteriores: UN renglón con el total, no una lista. "Ver y cobrar"
 * abre la lista y cada turno se cobra con el modal de siempre.
 */
export const TurnosNoCobrados: Story = {
  render: (args) => (
    <EarlierUnpaidBanner
      bookings={EARLIER}
      count={EARLIER.length + 3}
      pendingCents={EARLIER.reduce((sum, b) => sum + (b.pending ?? 0), 0) + 3 * 8_400_000}
      courts={COURTS}
      onOpenBooking={args.onOpenBooking}
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const banner = canvas.getByRole('button', { name: /10 turnos no cobrados/ })
    await expect(banner).toHaveTextContent('Ver y cobrar')
    await userEvent.click(banner)
    const dialog = within(await within(document.body).findByRole('dialog'))
    // El diálogo entra animado y, con varias stories en paralelo, el título puede no
    // estar visible todavía en el primer frame: se espera en vez de preguntar una vez.
    await waitFor(() => expect(dialog.getByText('Turnos no cobrados')).toBeVisible())
    await expect(dialog.getByText(/Quedan 3 más viejos/)).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: /Martín Díaz/ }))
    await expect(args.onOpenBooking).toHaveBeenCalledWith('antes-1')
  },
}
