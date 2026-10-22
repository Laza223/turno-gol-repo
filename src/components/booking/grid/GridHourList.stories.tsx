import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { buildBookingsIndex, computeCells, generateTimeSlots } from '@/lib/booking/grid-cells'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'
import { courts, courtFutbol5, courtFutbol7, courtFutbol11 } from '@/test/fixtures/court'
import { uid } from '@/test/fixtures/ids'
import { FROZEN_NOW, minutesFromNow } from '@/test/fixtures/clock'
import { GridHourList } from './GridHourList'

/**
 * La grilla en el teléfono (< md): lista hora por hora. Presentacional, como
 * GridScroller: las celdas salen de las mismas funciones puras de
 * lib/booking/grid-cells.ts que usa useGridLayout.
 *
 * FROZEN_NOW = sábado 14/03 a las 15:30 ART: 14:00 y 15:00 ya empezaron.
 */
const C1 = courtFutbol5().id
const C2 = courtFutbol7().id
const C3 = courtFutbol11().id

function gridBooking(
  over: Partial<GridBooking> & Pick<GridBooking, 'id' | 'courtId'>,
): GridBooking {
  return {
    date: '2026-03-14',
    timeStart: '14:00',
    timeEnd: '15:00',
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 3000000,
    pending: 3000000,
    totalPaid: 0,
    ...over,
  }
}

/** Una tarde con un estado de plata de cada tipo, para leerla bajando. */
function afternoonBookings(): GridBooking[] {
  return [
    // 14:00 — ya terminó: uno sin cobrar (rojo) y uno pagado (verde).
    gridBooking({
      id: uid(9101),
      courtId: C1,
      status: 'completed',
      playerFirstName: 'Lucas',
      playerLastName: 'Díaz',
    }),
    gridBooking({
      id: uid(9102),
      courtId: C2,
      status: 'completed',
      guestName: 'Sofi Acosta',
      pending: 0,
      totalPaid: 3000000,
    }),
    // 15:00 — se juega, con seña cobrada.
    gridBooking({
      id: uid(9103),
      courtId: C1,
      timeStart: '15:00',
      timeEnd: '16:00',
      guestName: 'Juan Pérez',
      pending: 2100000,
      totalPaid: 900000,
    }),
    // 15:00–18:00 — evento de 3 horas: sigue en las 16 y las 17.
    gridBooking({
      id: uid(9104),
      courtId: C3,
      timeStart: '15:00',
      timeEnd: '18:00',
      guestName: 'Cumple Tomi',
      priceSnapshot: 9000000,
      pending: 9000000,
    }),
    // 16:00 — una seña online en curso, con su cuenta regresiva.
    gridBooking({
      id: uid(9105),
      courtId: C2,
      timeStart: '16:00',
      timeEnd: '17:00',
      status: 'pending_payment',
      createdAt: minutesFromNow(-2),
    }),
    // 17:00 — bloqueo.
    gridBooking({
      id: uid(9106),
      courtId: C2,
      timeStart: '17:00',
      timeEnd: '18:00',
      type: 'block',
      priceSnapshot: 0,
      pending: null,
      totalPaid: null,
    }),
    // 18:00 — turno fijo por cobrar.
    gridBooking({
      id: uid(9107),
      courtId: C1,
      timeStart: '18:00',
      timeEnd: '19:00',
      type: 'fixed',
      guestName: 'Los Pibes',
    }),
  ]
}

function buildList(opts: {
  courts: CourtRow[]
  bookings: GridBooking[]
  openHhmm?: string
  closeHhmm?: string
  /** 'HH:MM' — null = el día mostrado no es hoy: nada pasó todavía. */
  nowTime: string | null
}) {
  const slots = generateTimeSlots(opts.openHhmm ?? '14:00', opts.closeHhmm ?? '20:00')
  const cells = computeCells(slots, opts.courts, buildBookingsIndex(opts.bookings))
  const nowTime = opts.nowTime
  const isSlotPast = (t: string) => (nowTime ? t < nowTime : false)
  const nowSlot = nowTime ? (slots.filter((s) => s <= nowTime).at(-1) ?? null) : null
  return { courts: opts.courts, slots, cells, isSlotPast, nowSlot }
}

const afternoon = buildList({ courts: courts(), bookings: afternoonBookings(), nowTime: '15:30' })

const meta = {
  title: 'Booking/Grid/GridHourList',
  component: GridHourList,
  parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'mobile-primary' } },
  args: {
    ...afternoon,
    isNavPending: false,
    nowMs: FROZEN_NOW.getTime(),
    ariaLabel: 'Turnos del Sáb 14 de marzo, hora por hora',
    pulseIds: new Set<string>(),
    detailBookingId: null,
    onDetailChange: fn(),
    onSlotClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex h-168 flex-col p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GridHourList>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Sábado 15:30, 4 canchas (una pausada). Se lee bajando: lo que ya se jugó
 * (con el "No cobrado" en rojo), la hora de ahora marcada y las libres de cada
 * hora como botones.
 */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: /^15:00\s*Ahora$/ })).toBeVisible()

    const unpaid = canvas.getByRole('button', {
      name: /^Cancha 1, de 14:00 a 15:00: Lucas Díaz, No cobrado, falta cobrar/,
    })
    await expect(within(unpaid).getByText('No cobrado')).toBeVisible()
    await userEvent.click(unpaid)
    await expect(args.onDetailChange).toHaveBeenCalledWith(uid(9101))

    // El evento de 3 horas sigue ocupando la cancha en las 16 y las 17.
    await expect(
      canvas.getAllByRole('button', {
        name: /^Cancha 3 - Fútbol 11: Cumple Tomi, sigue hasta las 18:00$/,
      }),
    ).toHaveLength(2)

    // La cancha pausada (Cancha 4) nunca se ofrece como libre.
    await expect(
      canvas.queryByRole('button', { name: /Reservar turno a las .* en Cancha 4/ }),
    ).toBeNull()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Reservar turno a las 16:00 en Cancha 1' }),
    )
    await expect(args.onSlotClick).toHaveBeenCalledWith(C1, '16:00')
  },
}

/** Chip "N sin cobrar" encendido: el que debe plata lleva el anillo rojo. */
export const ResaltandoLoPendiente: Story = {
  name: 'highlightPending=true (los turnos con saldo llevan anillo rojo)',
  args: { highlightPending: true },
}

/** Un día que no es hoy: nada empezó, todas las horas ofrecen sus libres y nadie dice "Ahora". */
export const OtroDia: Story = {
  name: 'Día distinto de hoy (sin "Ahora")',
  args: buildList({
    courts: [courtFutbol5(), courtFutbol7()],
    bookings: afternoonBookings().filter((b) => b.courtId !== C3),
    nowTime: null,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Ahora')).toBeNull()
    await expect(canvas.getAllByText('Libres').length).toBeGreaterThan(0)
  },
}

/** Ya cerró y no hubo turnos: no hay horas que mostrar, se dice en una línea. */
export const DiaPasadoSinTurnos: Story = {
  name: 'Día pasado sin turnos',
  args: buildList({ courts: [courtFutbol5()], bookings: [], nowTime: '23:00' }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No hubo turnos este día.')).toBeVisible()
  },
}

/** La mañana sin turnos que ya pasó se resume en una línea en vez de horas vacías. */
export const MananaSinTurnos: Story = {
  name: 'Horas pasadas vacías al principio → una línea "Sin turnos"',
  args: buildList({
    courts: [courtFutbol5(), courtFutbol7()],
    bookings: [
      gridBooking({
        id: uid(9201),
        courtId: C1,
        timeStart: '19:00',
        timeEnd: '20:00',
        guestName: 'Nico Paz',
      }),
    ],
    openHhmm: '09:00',
    closeHhmm: '23:00',
    nowTime: '17:30',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('09:00–18:00')).toBeVisible()
    await expect(canvas.queryByRole('heading', { name: /^17:00/ })).toBeNull()
  },
}

export const Oscuro: Story = {
  name: 'Tema oscuro',
  globals: { theme: 'dark' },
}
