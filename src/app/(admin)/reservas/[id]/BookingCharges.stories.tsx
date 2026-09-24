import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { uid } from '@/test/fixtures/ids'
import { artDateString, hoursFromNow } from '@/test/fixtures/clock'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { BookingStatus } from '@/modules/bookings/booking.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { BookingChargeRow } from '../queries'
import BookingCharges from './BookingCharges'

/**
 * `BookingChargeRow` es un shape angosto propio de `queries.ts` (id, amount,
 * method, description, occurredAt) — no tiene fixture compartida, así que se
 * arma acá mismo (mismo patrón que `detail()` en BookingDetailCard.stories.tsx).
 */
const charge = (overrides: Partial<BookingChargeRow> = {}): BookingChargeRow => ({
  id: uid(601),
  amount: 300000,
  method: 'cash',
  description: 'Cobro de turno',
  occurredAt: '2026-03-14T15:00:00.000Z',
  ...overrides,
})

const BOOKING_ID = uid(1001)

/**
 * 2026-09-24: arma el turno con el MISMO shape que consumen Hoy y la Grilla
 * (`GridBooking`) — `pending`/`totalPaid` salen de `summarizeBookingCharges`,
 * igual que hace `toGridBooking` en la página real, para no desincronizar los
 * números a mano en cada story.
 */
function booking(
  overrides: Partial<
    Pick<GridBooking, 'status' | 'priceSnapshot' | 'depositAmount' | 'depositStatus'>
  > & { chargesTotal?: number; endsInHours?: number } = {},
): GridBooking {
  const priceSnapshot = overrides.priceSnapshot ?? 1_500_000
  const depositAmount = overrides.depositAmount ?? 450_000
  const depositStatus = overrides.depositStatus ?? 'paid'
  const chargesTotal = overrides.chargesTotal ?? 0
  const { totalPaid, pending } = summarizeBookingCharges({
    priceSnapshot,
    depositAmount,
    depositStatus,
    chargesTotal,
  })
  // Positivo = todavía no terminó (modo 'advance'); negativo = ya terminó (modo
  // 'finish'). Sin efecto sobre 'completed' (modo 'settle' no mira `hasEnded`).
  const endsInHours = overrides.endsInHours ?? 1
  return {
    id: BOOKING_ID,
    courtId: uid(101),
    date: artDateString(),
    timeStart: '19:00',
    timeEnd: '20:00',
    status: (overrides.status ?? 'confirmed') as BookingStatus,
    type: 'spontaneous',
    guestName: 'Juan Pérez',
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot,
    paymentMethod: null,
    depositStatus,
    depositAmount,
    totalPaid,
    pending,
    startsAtMs: hoursFromNow(endsInHours - 1).getTime(),
    endsAtMs: hoursFromNow(endsInHours).getTime(),
  }
}

/** Cada acción de cobro por defecto resuelve OK; las stories pisan la que les toca aseverar. */
function makeActions() {
  return {
    addBookingChargeAction: fn(async (): Promise<ActionResult> => ({ success: true })),
    completeAndChargeBookingAction: fn(async (): Promise<ActionResult> => ({ success: true })),
    chargeDebtAction: fn(async (): Promise<ActionResult> => ({ success: true })),
    markNoShowAction: fn(async (): Promise<ActionResult> => ({ success: true })),
  }
}

const meta = {
  title: 'Admin/Reservas/BookingCharges',
  component: BookingCharges,
  parameters: { layout: 'padded' },
  args: {
    booking: booking(),
    charges: [],
    chargesTotal: 0,
    actions: makeActions(),
  },
  decorators: [
    // `[id]/page.tsx` monta BookingCharges bajo el mismo <h1> "Detalle de la
    // reserva" que BookingDetailCard (ver el decorator homólogo en
    // BookingDetailCard.stories.tsx). Su primer heading es un <h2> ("Cobros de
    // turno"); sin el <h1> por delante, axe marca heading-order. 42rem ≈ la
    // columna izquierda del detalle en escritorio (7/12 de 1152px).
    (Story) => (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Detalle de la reserva</h1>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BookingCharges>

export default meta
type Story = StoryObj<typeof meta>

/** Sin cobros de mostrador todavía: solo precio y seña, saldo pendiente = precio - seña. */
export const SinCargos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Precio del turno')).toBeVisible()
    await expect(canvas.getByText('$ 15.000')).toBeVisible()
    // $ 4.500 aparece dos veces: el monto de la seña y "Pagado" (que acá es
    // exactamente la seña, sin cobros de mostrador).
    await expect(canvas.getAllByText('$ 4.500')).toHaveLength(2)
    await expect(canvas.queryByText(/^Cobro ·/)).toBeNull()
    // priceSnapshot 15.000 - seña pagada 4.500 = saldo pendiente 10.500.
    await expect(canvas.getByText('$ 10.500')).toBeVisible()
    await expect(canvas.getByRole('button', { name: '+ Agregar cobro' })).toBeVisible()
  },
}

/** Con un cobro de mostrador registrado: aparece en la lista y entra en "Pagado". */
export const ConCargosYTotal: Story = {
  args: {
    booking: booking({ chargesTotal: 300_000 }),
    charges: [charge({ id: uid(602), amount: 300_000, method: 'transfer' })],
    chargesTotal: 300_000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cobro · Transferencia')).toBeVisible()
    await expect(canvas.getByText('$ 3.000')).toBeVisible()
    // Pagado = seña 4.500 + cobro 3.000 = 7.500. También es el saldo pendiente
    // (15.000 - 7.500), así que "$ 7.500" aparece dos veces (Pagado y Saldo pendiente).
    await expect(canvas.getByText('Pagado')).toBeVisible()
    await expect(canvas.getAllByText('$ 7.500')).toHaveLength(2)
  },
}

/** Saldo cubierto por completo: el renglón cambia a "Pagado completo" y el CTA queda apagado. */
export const PagadoCompleto: Story = {
  args: {
    // priceSnapshot 15.000 - seña 4.500 = falta 10.500 exactos.
    booking: booking({ chargesTotal: 1_050_000 }),
    charges: [charge({ id: uid(602), amount: 1_050_000 })],
    chargesTotal: 1_050_000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Saldo pendiente')).toBeVisible()
    await expect(canvas.getByText('Pagado completo')).toBeVisible()
    // Pagado = seña 4.500 + cobro 10.500 = 15.000, igual al precio del turno:
    // "$ 15.000" aparece dos veces (Precio del turno y Pagado).
    await expect(canvas.getAllByText('$ 15.000')).toHaveLength(2)
    // `chargeMode` da `null` con `pending <= 0`: sin turno que cobrar, el CTA
    // sigue existiendo pero apagado (mismo criterio que antes de este cambio).
    await expect(canvas.getByRole('button', { name: '+ Agregar cobro' })).toBeDisabled()
  },
}

/**
 * Modo 'advance': el turno todavía no terminó, cobrar es un adelanto. El
 * control es el mismo que Hoy y la Grilla (`HoyChargeSection`): al abrir, el
 * monto viene precargado con el saldo pendiente completo.
 */
export const Anticipo: Story = {
  args: {
    booking: booking({ endsInHours: 2 }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: '+ Agregar cobro' }))
    const amountInput = canvas.getByLabelText('Monto')
    await expect(amountInput).toHaveValue('10.500')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '6000')
    await userEvent.click(canvas.getByRole('button', { name: 'Método de pago' }))
    await userEvent.click(await body.findByRole('menuitemradio', { name: 'Transferencia' }))
    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar .* por adelantado/ }))

    await waitFor(() =>
      expect(args.actions.addBookingChargeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: BOOKING_ID,
          charges: [{ amount: 600_000, method: 'transfer' }],
        }),
      ),
    )
    await expect(args.actions.completeAndChargeBookingAction).not.toHaveBeenCalled()
    await expect(args.actions.chargeDebtAction).not.toHaveBeenCalled()
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
    // El form se cierra solo tras el éxito: vuelve a aparecer el botón de abrirlo.
    await expect(await canvas.findByRole('button', { name: '+ Agregar cobro' })).toBeVisible()
  },
}

/**
 * Modo 'finish': el turno ya terminó. Cobrar el saldo completo lo da por
 * jugado en el MISMO llamado (`completeAndChargeBookingAction`) — ya no hace
 * falta pasar antes por "Marcar completada".
 */
export const TurnoTerminado: Story = {
  args: {
    booking: booking({ endsInHours: -1 }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '+ Agregar cobro' }))
    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar .* y dar por jugado/ }))

    await waitFor(() =>
      expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: BOOKING_ID,
          charges: [{ amount: 1_050_000, method: 'cash' }],
        }),
      ),
    )
    await expect(args.actions.addBookingChargeAction).not.toHaveBeenCalled()
  },
}

/**
 * Modo 'settle': el turno ya se jugó (`completed`) y quedó saldo — mismo
 * cobro de deuda que `/caja/deudas` (`chargeDebtAction`).
 */
export const SaldoDeTurnoJugado: Story = {
  args: {
    booking: booking({ status: 'completed' }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '+ Agregar cobro' }))
    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar/ }))

    await waitFor(() =>
      expect(args.actions.chargeDebtAction).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: BOOKING_ID,
          charges: [{ amount: 1_050_000, method: 'cash' }],
        }),
      ),
    )
  },
}

/** El servidor rechaza el cobro (ej. turno ya saldado en otra pestaña): error inline, el form no se cierra. */
export const ErrorDelServidor: Story = {
  args: {
    booking: booking({ endsInHours: 2 }),
    actions: {
      ...makeActions(),
      addBookingChargeAction: fn(async (): Promise<ActionResult> => ({
        success: false,
        error: 'La caja de hoy ya fue cerrada. Registrá el cobro como ajuste en Caja.',
      })),
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '+ Agregar cobro' }))
    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar/ }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya fue cerrada/i)
    await expect(args.actions.addBookingChargeAction).toHaveBeenCalled()
    // El form sigue abierto: "Cancelar" sigue en pantalla, no volvió "+ Agregar cobro".
    await expect(canvas.getByRole('button', { name: 'Cancelar' })).toBeVisible()
  },
}
