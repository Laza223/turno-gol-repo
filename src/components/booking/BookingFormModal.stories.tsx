import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { booking } from '@/test/fixtures/booking'
import { abonado } from '@/test/fixtures/abonado'
import { courtFutbol5 } from '@/test/fixtures/court'
import { generateTimeSlots } from '@/lib/booking/grid-cells'
import { BookingFormModal } from './BookingFormModal'

/**
 * Modal único por tipo (pages/grilla.md §3bis): "¿Qué vas a agendar?" a la
 * izquierda, campos del tipo elegido al centro, resumen fijo a la derecha.
 *
 * Las Server Actions llegan por PROP (createBookingAction/createAbonadoAction),
 * igual que el modal viejo — es un Radix Dialog portaled a `document.body`, así
 * que los `play` consultan contra `canvasElement.ownerDocument.body`.
 *
 * `TypePicker` duplica sus 4 opciones en DOS controles (chips de teléfono +
 * columna de escritorio), resueltos por CSS — en Storybook (browser real) sólo
 * uno queda visible según el viewport, pero el nombre accesible de cada chip es
 * MÁS CORTO que el de la tarjeta de escritorio (sin la línea de ayuda), así que
 * un `name` exacto ("Turno fijo") selecciona sin ambigüedad en cualquier ancho.
 */
const meta = {
  title: 'Booking/Grid/BookingFormModal',
  component: BookingFormModal,
  parameters: { layout: 'centered' },
  args: {
    slot: {
      courtId: courtFutbol5().id,
      courtName: 'Cancha 1',
      date: '2026-03-16', // lunes
      timeStart: '18:00',
    },
    pricing: courtFutbol5().pricing,
    dayBookings: [],
    daySlots: generateTimeSlots('08:00', '23:00'),
    isSlotPast: () => false,
    open: true,
    onClose: fn(),
    onSuccess: fn(),
    createAbonadoAction: fn(async () => ({
      success: true as const,
      abonado: abonado(),
      slotsGenerated: 8,
      conflictDates: [],
    })),
  },
} satisfies Meta<typeof BookingFormModal>

export default meta
type Story = StoryObj<typeof meta>

/** Default: Turno ya seleccionado — nombre, horario fijo de 1h, precio de la grilla. */
export const Turno: Story = {
  args: {
    createBookingAction: fn(async () => ({ success: true as const, booking: booking() })),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.type(body.getByLabelText('¿A nombre de quién?'), 'Juan Pérez')
    await userEvent.click(body.getByRole('button', { name: /Agendar turno/ }))
    await waitFor(() => expect(args.createBookingAction).toHaveBeenCalled())
    const payload = (args.createBookingAction as ReturnType<typeof fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >
    await expect(payload).toMatchObject({
      type: 'spontaneous',
      timeStart: '18:00',
      timeEnd: '19:00',
    })
  },
}

/**
 * Plan gratis (freemium v2): se anota quién juega, sin precio, cobro ni nota, y
 * solo hay Turno y Bloquear cancha. El turno sale en $0 explícito.
 */
export const TurnoPlanGratis: Story = {
  name: 'Plan gratis — turno con nombre y teléfono, sin plata',
  args: {
    freePlan: true,
    createBookingAction: fn(async () => ({ success: true as const, booking: booking() })),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(body.queryByRole('radio', { name: 'Turno fijo' })).toBeNull()
    await expect(body.queryByRole('radio', { name: 'Evento' })).toBeNull()
    await expect(body.queryByText('Precio y cobro')).toBeNull()
    await expect(body.queryByRole('button', { name: 'Agregar nota' })).toBeNull()
    await userEvent.type(body.getByLabelText('¿A nombre de quién?'), 'Juan Pérez')
    await userEvent.click(body.getByRole('button', { name: /Agendar turno/ }))
    await waitFor(() => expect(args.createBookingAction).toHaveBeenCalled())
    const payload = (args.createBookingAction as ReturnType<typeof fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >
    await expect(payload).toMatchObject({
      type: 'spontaneous',
      guestName: 'Juan Pérez',
      priceOverride: 0,
    })
    await expect(payload).not.toHaveProperty('depositAmount')
    await expect(payload).not.toHaveProperty('notesInternal')
  },
}

export const TurnoFijo: Story = {
  name: 'Turno fijo — reusa createAbonadoAction con el día/hora del casillero',
  args: {
    createBookingAction: fn(async () => ({ success: true as const, booking: booking() })),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('radio', { name: 'Turno fijo' }))
    await userEvent.type(await body.findByLabelText('Nombre de contacto'), 'Julián Álvarez')
    await userEvent.type(body.getByLabelText('Teléfono'), '11 2233-4455')
    await userEvent.click(body.getByRole('button', { name: 'Crear turno fijo' }))
    await waitFor(() => expect(args.createAbonadoAction).toHaveBeenCalled())
    const payload = (args.createAbonadoAction as ReturnType<typeof fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >
    await expect(payload).toMatchObject({
      dayOfWeek: 1,
      timeStart: '18:00',
      startsOn: '2026-03-16',
    })
  },
}

export const EventoConPrecio: Story = {
  name: 'Evento — sugiere el total de la grilla, editable',
  args: {
    createBookingAction: fn(async () => ({ success: true as const, booking: booking() })),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('radio', { name: 'Evento' }))
    await userEvent.click(await body.findByRole('button', { name: 'Torneo' }))
    await userEvent.click(body.getByRole('button', { name: /Agendar evento/ }))
    await waitFor(() => expect(args.createBookingAction).toHaveBeenCalled())
    const payload = (args.createBookingAction as ReturnType<typeof fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >
    await expect(payload).toMatchObject({ guestName: 'Torneo' })
    await expect(payload).not.toHaveProperty('priceOverride')
  },
}

export const EventoSinCobro: Story = {
  name: 'Evento — "Sin costo" manda priceOverride: 0 y esconde el cobro',
  args: {
    createBookingAction: fn(async () => ({ success: true as const, booking: booking() })),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('radio', { name: 'Evento' }))
    await userEvent.type(await body.findByLabelText('Nombre del evento o responsable'), 'Escuelita')
    await userEvent.click(body.getByRole('radio', { name: 'Sin costo' }))
    await expect(body.queryByText('¿Cobraste algo ahora?')).not.toBeInTheDocument()
    await userEvent.click(body.getByRole('button', { name: 'Agendar evento' }))
    await waitFor(() => expect(args.createBookingAction).toHaveBeenCalled())
    const payload = (args.createBookingAction as ReturnType<typeof fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >
    await expect(payload).toMatchObject({ priceOverride: 0 })
    await expect(payload).not.toHaveProperty('depositMethod')
  },
}

export const Bloqueo: Story = {
  name: 'Bloquear cancha — nunca manda precio, seña ni contacto',
  args: {
    createBookingAction: fn(async () => ({ success: true as const, booking: booking() })),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('radio', { name: 'Bloquear cancha' }))
    await userEvent.click(body.getByRole('button', { name: 'Bloquear cancha' }))
    await waitFor(() => expect(args.createBookingAction).toHaveBeenCalled())
    const payload = (args.createBookingAction as ReturnType<typeof fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >
    await expect(payload).toMatchObject({ type: 'block', guestName: 'Mantenimiento' })
    await expect(payload).not.toHaveProperty('priceOverride')
    await expect(payload).not.toHaveProperty('depositMethod')
    await expect(payload).not.toHaveProperty('guestPhone')
  },
}

export const TurnoTomado: Story = {
  name: 'checkAvailabilityAction → available:false — aviso, submit sigue habilitado',
  args: {
    createBookingAction: fn(async () => ({ success: true as const, booking: booking() })),
    checkAvailabilityAction: fn(async () => ({ available: false })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(
      await body.findByText('Ese horario ya se ocupó. Elegí otro para seguir.'),
    ).toBeInTheDocument()
  },
}

export const ErrorDelServidor: Story = {
  name: 'La action devuelve { success: false } — alert rojo',
  args: {
    createBookingAction: fn(async () => ({
      success: false as const,
      error: 'Ese horario ya se ocupó. Elegí otro para seguir.',
    })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.type(body.getByLabelText('¿A nombre de quién?'), 'Juan Pérez')
    await userEvent.click(body.getByRole('button', { name: /Agendar turno/ }))
    await expect(await body.findByRole('alert')).toHaveTextContent(
      'Ese horario ya se ocupó. Elegí otro para seguir.',
    )
  },
}
