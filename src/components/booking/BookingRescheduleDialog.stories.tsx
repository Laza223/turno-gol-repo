import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { booking, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'
import { BookingRescheduleDialog, type ListRescheduleSlots } from './BookingRescheduleDialog'

/**
 * Mover un turno a otra cancha / día / horario (Fase 3, criterio de salida #2).
 *
 * El riesgo real de esta pantalla no es que no funcione: es que mueva plata sin
 * que el admin lo note. Por eso el precio tiene dos stories propias, una por
 * cada régimen:
 *
 *  - turno común (`spontaneous`) → el precio se RECALCULA a la franja destino,
 *    y si cambia hay que avisarlo (`CambioDeTarifa`);
 *  - sesión de abonado (`fixed`) → el precio del CONTRATO manda y el backend
 *    ignora la tarifa de la franja, así que la pantalla no puede mostrar un
 *    número que el servidor no va a usar (`TurnoFijo`).
 *
 * Las Server Actions llegan por prop (ver BookingSlotPanel).
 */
const SLOTS = [
  { timeStart: '19:00', timeEnd: '20:00', price: 2400000, available: true },
  { timeStart: '20:00', timeEnd: '21:00', price: 2400000, available: false },
  { timeStart: '21:00', timeEnd: '22:00', price: 2800000, available: true },
  { timeStart: '22:00', timeEnd: '23:00', price: 2800000, available: true },
]

const meta = {
  title: 'Booking/Grid/BookingRescheduleDialog',
  component: BookingRescheduleDialog,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    onOpenChange: fn(),
    booking: {
      ...toGridBooking(booking(), player()),
      courtId: 'court-1',
      timeStart: '20:00',
      timeEnd: '21:00',
      priceSnapshot: 2400000,
    },
    courts: [
      { id: 'court-1', name: 'Cancha 1' },
      { id: 'court-2', name: 'Cancha 2' },
      // Una cancha pausada no toma turnos: el selector no la ofrece.
      { id: 'court-3', name: 'Cancha 3', status: 'offline' as const },
    ],
    // Anotado con el tipo de la prop (y no inferido del mock): sin esto,
    // `satisfies Meta` fija la rama `success: true` y las stories de error no
    // typecheckean.
    listSlotsAction: fn(async () => ({
      success: true as const,
      slots: SLOTS,
      minDate: '2026-08-04',
      maxDate: '2026-08-10',
    })) as ListRescheduleSlots,
    rescheduleAction: fn(async () => ({ success: true, priceChanged: false })),
    onSuccess: fn(),
  },
} satisfies Meta<typeof BookingRescheduleDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Lista de huecos: los ocupados quedan deshabilitados, no escondidos. */
export const Base: Story = {
  play: async ({ canvasElement }) => {
    const d = within(canvasElement.ownerDocument.body)
    await expect(await d.findByRole('radiogroup')).toBeTruthy()
    // La cancha pausada no aparece en el selector.
    await expect(d.queryByRole('option', { name: 'Cancha 3' })).toBeNull()
  },
}

/** Sin huecos ese día: se dice por qué, no se deja la lista vacía sin explicación. */
export const SinHorarios: Story = {
  args: {
    listSlotsAction: fn(async () => ({
      success: true as const,
      slots: [],
      minDate: '2026-08-04',
      maxDate: '2026-08-10',
    })),
  },
  play: async ({ canvasElement }) => {
    const d = within(canvasElement.ownerDocument.body)
    await expect(await d.findByText(/No hay horarios disponibles/)).toBeTruthy()
  },
}

/** El listado falló: el error se ve, no queda cargando para siempre. */
export const ErrorAlCargar: Story = {
  args: {
    listSlotsAction: fn(async () => ({
      success: false as const,
      error: 'Demasiadas consultas. Probá en unos segundos.',
    })),
  },
  play: async ({ canvasElement }) => {
    const d = within(canvasElement.ownerDocument.body)
    await expect(await d.findByText(/Demasiadas consultas/)).toBeTruthy()
  },
}

/**
 * Turno común movido a una franja de OTRA tarifa: el cambio de precio se
 * anuncia con el delta, no se aplica en silencio.
 */
export const CambioDeTarifa: Story = {
  play: async ({ canvasElement }) => {
    const d = within(canvasElement.ownerDocument.body)
    // 21:00 vale $28.000 y el turno está pactado en $24.000.
    await (await d.findByRole('radio', { name: /^21:00/ })).click()
    await expect(await d.findByText(/El precio pasa de/)).toBeTruthy()
  },
}

/**
 * Sesión de abonado: el precio del contrato NO se toca, sin importar a qué
 * franja se mueva (decisión del dueño 2026-08-05, `booking.reschedule.ts` rama
 * `type === 'fixed'`).
 *
 * Es la story que faltaba cuando se implementó: sin ella el aviso y las fichas
 * de horario de este modo nunca pasaban por axe, que en este repo es el único
 * lugar que mide contraste.
 */
export const TurnoFijo: Story = {
  args: {
    booking: {
      ...meta.args.booking,
      type: 'fixed' as const,
    },
  },
  play: async ({ canvasElement }) => {
    const d = within(canvasElement.ownerDocument.body)
    await expect(await d.findByText(/se mantiene el precio del contrato/)).toBeTruthy()

    // Las fichas muestran el precio del contrato ($24.000) y NUNCA el de la
    // franja destino ($28.000): mostrarlo sería mostrar un número que el
    // servidor descarta.
    await expect(await d.findByRole('radio', { name: /^21:00/ })).toHaveTextContent(/24\.000/)
    await expect(d.queryByText(/28\.000/)).toBeNull()

    // Y con una franja de otra tarifa elegida, el banner de delta no aparece.
    await (await d.findByRole('radio', { name: /^21:00/ })).click()
    await expect(d.queryByText(/El precio pasa de/)).toBeNull()
  },
}

/**
 * El MISMO error, en tema oscuro.
 *
 * Antes de esta tanda el repo no tenía UNA sola story en dark (`globals.theme`
 * quedaba siempre en 'light'), así que axe venía midiendo medio design system.
 * Y el lado sin medir era justo donde el rojo del token se cae:
 * `text-destructive` es red-600 en los dos temas, y sobre la superficie oscura
 * daba 3.87:1.
 */
export const ErrorAlCargarOscuro: Story = {
  ...ErrorAlCargar,
  globals: { theme: 'dark' },
}
