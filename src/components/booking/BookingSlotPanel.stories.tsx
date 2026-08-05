import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import {
  booking,
  bookingBlock,
  bookingCompleted,
  bookingNoShow,
  toGridBooking,
} from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'
import { BookingSlotPanel, type SlotPanelActions } from './BookingSlotPanel'

/**
 * Panel lateral del turno (Fase 3): cobrar, cargar cantina, marcar ausente y
 * reprogramar, sin salir de la grilla.
 *
 * Qué acción ofrece NO sale del status a secas: cruza estado, tipo y plata
 * pendiente. Las stories de abajo son una por rama de esa decisión, que es
 * donde está el riesgo real (ofrecer "cobrar" en un turno que el backend va a
 * rechazar, "marcar ausente" en una hora de torneo, o "reprogramar" uno ya
 * jugado que `rescheduleBooking` rechaza por estado terminal).
 *
 * Las Server Actions llegan por prop: importarlas arrastraría `node:async_hooks`
 * y rompería el bundle de Storybook. El diálogo de cantina, además, llega
 * inyectado (`renderCanteenDialog`) porque vive bajo la ruta — acá va un stub.
 */
const okActions = (): SlotPanelActions => ({
  chargeDebtAction: fn(async () => ({ success: true as const })),
  completeAndChargeBookingAction: fn(async () => ({ success: true })),
  addBookingChargeAction: fn(async () => ({ success: true })),
  markNoShowAction: fn(async () => ({ success: true })),
  revertNoShowAction: fn(async () => ({ success: true })),
  listRescheduleSlotsAction: fn(async () => ({
    success: true as const,
    slots: [
      { timeStart: '19:00', timeEnd: '20:00', price: 2400000, available: true },
      { timeStart: '20:00', timeEnd: '21:00', price: 2400000, available: false },
      { timeStart: '21:00', timeEnd: '22:00', price: 2800000, available: true },
    ],
    minDate: '2026-08-04',
    maxDate: '2026-08-10',
  })),
  rescheduleBookingAction: fn(async () => ({ success: true, priceChanged: true })),
})

const COURTS = [
  { id: 'court-1', name: 'Cancha 1' },
  { id: 'court-2', name: 'Cancha 2' },
]

/** Un turno de hoy que ya terminó — es cuando el mostrador cobra de verdad. */
const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const meta = {
  title: 'Booking/Grid/BookingSlotPanel',
  component: BookingSlotPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    courtName: 'Cancha 1',
    onClose: fn(),
    // Lo decide la grilla (día operativo), no el panel — ver la prop.
    hasEnded: true,
    courts: COURTS,
    renderCanteenDialog: ({ open }) =>
      open ? <p style={{ padding: 16 }}>[diálogo de cantina]</p> : null,
    actions: okActions(),
    booking: {
      ...toGridBooking(booking(), player()),
      date: AYER,
      priceSnapshot: 2400000,
      totalPaid: 720000,
      pending: 1680000,
    },
  },
} satisfies Meta<typeof BookingSlotPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Confirmado, ya terminó, con saldo: cobrar y dar por jugado en un solo paso. */
export const CobrarYCerrar: Story = {
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(await panel.findByText('Cobrar y dar por jugado')).toBeTruthy()
    // Confirmado ⇒ todavía se puede mover (RESCHEDULABLE_STATUSES).
    await expect(await panel.findByRole('button', { name: /Reprogramar/ })).toBeTruthy()
    await expect(await panel.findByRole('button', { name: /Cargar cantina/ })).toBeTruthy()
  },
}

/** Jugado con saldo: la alarma de la grilla. Sólo queda cobrar lo que falta. */
export const JugadaSinCobrar: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingCompleted()),
      date: AYER,
      priceSnapshot: 2400000,
      totalPaid: 0,
      pending: 2400000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(await panel.findByText('Cobrar lo que falta')).toBeTruthy()
    // Estado terminal: `rescheduleBooking` lo rechaza, así que no se ofrece.
    await expect(panel.queryByRole('button', { name: /Reprogramar/ })).toBeNull()
    // Pero la cantina sí: se consume durante el partido y se paga al final.
    await expect(await panel.findByRole('button', { name: /Cargar cantina/ })).toBeTruthy()
  },
}

/** Confirmado pero todavía no jugado: es un adelanto, y el backend acepta una sola línea. */
export const CobrarPorAdelantado: Story = {
  args: {
    hasEnded: false,
    booking: {
      ...toGridBooking(booking(), player()),
      priceSnapshot: 2400000,
      totalPaid: 0,
      pending: 2400000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(await panel.findByText('Cobrar por adelantado')).toBeTruthy()
    // Un turno futuro no puede estar "ausente": todavía no pasó nada.
    await expect(panel.queryByRole('button', { name: /Marcar ausente/ })).toBeNull()
  },
}

/** Turno saldado: no hay nada que cobrar, el panel no ofrece la sección. */
export const SinSaldo: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingCompleted()),
      date: AYER,
      priceSnapshot: 2400000,
      totalPaid: 2400000,
      pending: 0,
    },
  },
}

/** Ya marcado ausente: la única acción es deshacerlo (ventana de 24hs). */
export const Ausente: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingNoShow()),
      date: AYER,
      priceSnapshot: 2400000,
      totalPaid: 720000,
      pending: 1680000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(await panel.findByRole('button', { name: /Deshacer la ausencia/ })).toBeTruthy()
  },
}

/** Bloqueo de mantenimiento: no es la reserva de nadie, no hay plata ni ausencia. */
export const Bloqueo: Story = {
  args: {
    booking: { ...toGridBooking(bookingBlock()), date: AYER, pending: 0, totalPaid: 0 },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(panel.queryByRole('button', { name: /Marcar ausente/ })).toBeNull()
    // No es el turno de nadie: no hay a quién venderle ni a quién mover.
    await expect(panel.queryByRole('button', { name: /Cargar cantina/ })).toBeNull()
    await expect(panel.queryByRole('button', { name: /Reprogramar/ })).toBeNull()
  },
}

/** Sin Server Actions (el modo en el que corren otras stories): abre igual, sólo mira. */
export const SoloLectura: Story = {
  args: { actions: undefined },
}
