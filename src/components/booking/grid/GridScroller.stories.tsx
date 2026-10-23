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
import { FROZEN_NOW } from '@/test/fixtures/clock'
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
  // Alto MÍNIMO de fila (variante "Entra entera"): la fila real la reparte
  // `minmax(rowHeightRem, 1fr)` en GridScroller.
  const rowHeightRem = 3.5

  // Fila (índice en `visibleSlots`) y fracción de la línea de "ahora": la
  // MISMA cuenta que useNowLine, sin el auto-scroll (acá no hay DOM real que
  // medir; nowLineRef queda sin usar en las stories).
  let nowRowIndex: number | null = null
  let nowFraction = 0
  const first = visibleSlots[0]
  if (opts.nowTime && first) {
    const [nH, nM] = opts.nowTime.split(':').map(Number)
    const [fH, fM] = first.split(':').map(Number)
    const nowMins = (nH ?? 0) * 60 + (nM ?? 0)
    const firstMins = (fH ?? 0) * 60 + (fM ?? 0)
    if (nowMins >= firstMins) {
      const elapsed = nowMins - firstMins
      const idx = Math.floor(elapsed / 60)
      if (idx < visibleSlots.length) {
        nowRowIndex = idx
        nowFraction = (elapsed % 60) / 60
      }
    }
  }

  return {
    slots,
    cells,
    collapsedCount,
    visibleSlots,
    hasBand,
    rowOffset,
    rowHeightRem,
    isSlotPast,
    nowRowIndex,
    nowFraction,
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
    nowRowIndex: saturday.nowRowIndex,
    nowFraction: saturday.nowFraction,
    nowLineRef: { current: null },
    isNavPending: false,
    // FROZEN_NOW = mismo "ahora" (15:30 ART) que usa `saturday` arriba. Los
    // fixtures de `saturdayAfternoonGridBookings` no traen `pending`, así que
    // esto no cambia ninguna celda — solo completa la firma nueva de `nowMs`.
    nowMs: FROZEN_NOW.getTime(),
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
      <div className="flex h-128 flex-col p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GridScroller>

export default meta
type Story = StoryObj<typeof meta>

/** Tarde de sábado llena, 4 canchas (una offline), línea de "ahora" a las 15:30. */
export const Default: Story = {}

/**
 * Teléfono: la MISMA matriz, con columnas de 48 px (44 tocables) y el eje de
 * horas en dos dígitos. Reemplazó a la lista por hora con carrusel de
 * canchas, donde leer una sola hora obligaba a recorrer fichas de a una.
 */
export const EnTelefono: Story = {
  name: 'Teléfono (columnas de 48px)',
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
}

/**
 * Chip "N sin cobrar" encendido: los turnos con saldo llevan un anillo
 * rojo, así se encuentran de un vistazo en una matriz llena.
 */
export const ResaltandoLoPendiente: Story = {
  name: 'highlightPending=true (los turnos con saldo llevan anillo rojo)',
  args: { highlightPending: true },
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
      rowHeightRem: dawn.rowHeightRem,
      nowRowIndex: dawn.nowRowIndex,
      nowFraction: dawn.nowFraction,
      isSlotPast: dawn.isSlotPast,
    }
  })(),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const band = canvas.getByRole('button', { name: /Mostrar horarios sin turnos/ })
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
    const empty = buildLayout({
      courts: [courtFutbol5(), courtFutbol7()],
      bookings: [],
      nowTime: '15:30',
    })
    return {
      courts: [courtFutbol5(), courtFutbol7()],
      slots: empty.slots,
      visibleSlots: empty.visibleSlots,
      cells: empty.cells,
      collapsedCount: empty.collapsedCount,
      hasBand: empty.hasBand,
      rowOffset: empty.rowOffset,
      rowHeightRem: empty.rowHeightRem,
      nowRowIndex: empty.nowRowIndex,
      nowFraction: empty.nowFraction,
      isSlotPast: empty.isSlotPast,
    }
  })(),
}

export const SinLineaDeAhora: Story = {
  name: 'Día distinto de hoy (sin línea de "ahora")',
  args: { nowRowIndex: null, isSlotPast: () => false },
}
