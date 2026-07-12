import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  buildBookingsIndex,
  computeCells,
  countCollapsibleLeading,
  generateTimeSlots,
} from '@/lib/booking/grid-cells'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'
import { courts, courtFutbol5, courtFutbol7 } from '@/test/fixtures/court'
import { saturdayAfternoonGridBookings } from '@/test/fixtures/booking'
import { GridScroller } from './GridScroller'

/**
 * Región scrollable de la grilla — presentacional puro, pero toda su matemática
 * de layout (slots, celdas, colapso de madrugada, línea de "ahora") llega
 * resuelta desde useGridLayout/useNowLine. Acá se recalcula con las mismas
 * funciones puras de lib/booking/grid-cells.ts (no se reimplementa la lógica a
 * mano), sobre datos de @/test/fixtures/booking.
 */
function buildLayout(opts: {
  courts: CourtRow[]
  bookings: GridBooking[]
  openHhmm?: string
  closeHhmm?: string
  isCompact?: boolean
  /** 'HH:MM' — null = ningún slot es pasado y no se dibuja línea de "ahora". */
  nowTime?: string | null
}) {
  const openHhmm = opts.openHhmm ?? '14:00'
  const closeHhmm = opts.closeHhmm ?? '20:00'
  const slots = generateTimeSlots(openHhmm, closeHhmm)
  const cells = computeCells(slots, opts.courts, buildBookingsIndex(opts.bookings))
  const isSlotPast = (t: string) => (opts.nowTime ? t < opts.nowTime : false)
  const collapsedCount = countCollapsibleLeading(slots, opts.courts, cells, isSlotPast)
  const visibleSlots = collapsedCount > 0 ? slots.slice(collapsedCount) : slots
  const hasBand = collapsedCount > 0
  const rowOffset = hasBand ? 3 : 2
  const isCompact = opts.isCompact ?? false
  const rowHeightRem = isCompact ? 2.75 : 3.25

  let nowTopRem: number | null = null
  const first = visibleSlots[0]
  if (opts.nowTime && first) {
    const [nH, nM] = opts.nowTime.split(':').map(Number)
    const [fH, fM] = first.split(':').map(Number)
    const nowMins = (nH ?? 0) * 60 + (nM ?? 0)
    const firstMins = (fH ?? 0) * 60 + (fM ?? 0)
    if (nowMins >= firstMins) {
      const headerRem = 2.75 + (hasBand ? 2.75 : 0)
      const top = headerRem + ((nowMins - firstMins) / 60) * rowHeightRem
      const maxTop = headerRem + visibleSlots.length * rowHeightRem
      nowTopRem = top <= maxTop ? top : null
    }
  }

  return {
    slots,
    cells,
    collapsedCount,
    visibleSlots,
    hasBand,
    rowOffset,
    isCompact,
    rowHeightRem,
    isSlotPast,
    nowTopRem,
  }
}

const saturday = buildLayout({
  courts: courts(),
  bookings: saturdayAfternoonGridBookings(),
  nowTime: '15:30', // FROZEN_NOW ART
})

const meta = {
  title: 'Booking/Grid/GridScroller',
  component: GridScroller,
  parameters: { layout: 'fullscreen' },
  args: {
    courts: courts(),
    slots: saturday.slots,
    visibleSlots: saturday.visibleSlots,
    cells: saturday.cells,
    collapsedCount: saturday.collapsedCount,
    hasBand: saturday.hasBand,
    rowOffset: saturday.rowOffset,
    rowHeightRem: saturday.rowHeightRem,
    nowTopRem: saturday.nowTopRem,
    isCompact: false,
    isNavPending: false,
    gridScrollRef: { current: null },
    ariaLabel: 'Grilla de turnos del Sáb 14 de marzo',
    isSlotPast: saturday.isSlotPast,
    pulseIds: new Set<string>(),
    detailBookingId: null,
    onDetailChange: fn(),
    onSlotClick: fn(),
    onGridKeyDown: fn(),
    onExpandMorning: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-[32rem] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GridScroller>

export default meta
type Story = StoryObj<typeof meta>

/** Tarde de sábado llena, 4 canchas (una offline), línea de "ahora" a las 15:30. */
export const Default: Story = {}

export const Compacto: Story = {
  name: 'isCompact=true (filas de 2.75rem)',
  args: (() => {
    const compact = buildLayout({
      courts: courts(),
      bookings: saturdayAfternoonGridBookings(),
      nowTime: '15:30',
      isCompact: true,
    })
    return {
      visibleSlots: compact.visibleSlots,
      cells: compact.cells,
      rowHeightRem: compact.rowHeightRem,
      nowTopRem: compact.nowTopRem,
      isCompact: true,
    }
  })(),
}

export const ConBandaDeMadrugada: Story = {
  name: 'hasBand=true — madrugada muerta colapsada',
  args: (() => {
    const dawn = buildLayout({
      courts: [courtFutbol5(), courtFutbol7()],
      bookings: [],
      openHhmm: '00:00',
      closeHhmm: '11:00',
      nowTime: '08:30',
    })
    return {
      courts: [courtFutbol5(), courtFutbol7()],
      slots: dawn.slots,
      visibleSlots: dawn.visibleSlots,
      cells: dawn.cells,
      collapsedCount: dawn.collapsedCount,
      hasBand: dawn.hasBand,
      rowOffset: dawn.rowOffset,
      nowTopRem: dawn.nowTopRem,
      isSlotPast: dawn.isSlotPast,
    }
  })(),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const band = canvas.getByRole('button', { name: /Mostrar horarios sin actividad/ })
    await expect(band).toBeInTheDocument()
    await userEvent.click(band)
    await expect(args.onExpandMorning).toHaveBeenCalledOnce()
  },
}

export const NavegacionPendiente: Story = {
  name: 'isNavPending=true (grilla atenuada durante router.push)',
  args: { isNavPending: true },
}

export const GrillaVacia: Story = {
  name: 'Día sin reservas (todas las celdas libres)',
  args: (() => {
    const empty = buildLayout({ courts: [courtFutbol5(), courtFutbol7()], bookings: [], nowTime: '15:30' })
    return {
      courts: [courtFutbol5(), courtFutbol7()],
      slots: empty.slots,
      visibleSlots: empty.visibleSlots,
      cells: empty.cells,
      collapsedCount: empty.collapsedCount,
      hasBand: empty.hasBand,
      rowOffset: empty.rowOffset,
      nowTopRem: empty.nowTopRem,
      isSlotPast: empty.isSlotPast,
    }
  })(),
}

export const SinLineaDeAhora: Story = {
  name: 'Día distinto de hoy (sin línea de "ahora")',
  args: { nowTopRem: null, isSlotPast: () => false },
}
