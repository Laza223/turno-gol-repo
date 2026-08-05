import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { expectGone } from '@/test/expect-gone'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { uid } from '@/test/fixtures/ids'
import { cashFlow } from '@/test/fixtures/cashflow'
import type { BookingChargeRow } from '../queries'
import type { BookingChargeActionResult } from '../actions'
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

const meta = {
  title: 'Admin/Reservas/BookingCharges',
  component: BookingCharges,
  parameters: { layout: 'padded' },
  args: {
    bookingId: BOOKING_ID,
    priceSnapshot: 1_500_000,
    depositAmount: 450_000,
    depositStatus: 'paid',
    charges: [],
    chargesTotal: 0,
    addBookingChargeAction: fn(
      async (): Promise<BookingChargeActionResult> => ({ success: true, cashFlow: cashFlow() }),
    ),
  },
  decorators: [
    // `[id]/page.tsx` monta BookingCharges bajo el mismo <h1> "Detalle de la
    // reserva" que BookingDetailCard (ver el decorator homólogo en
    // BookingDetailCard.stories.tsx). El componente trae su propia superficie
    // (.card-premium), pero su primer heading es un <h2> ("Cobros de turno");
    // sin el <h1> por delante, axe marca heading-order.
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

/** Saldo cubierto por completo: el renglón cambia a "Pagado completo" en verde. */
export const PagadoCompleto: Story = {
  args: {
    // priceSnapshot 15.000 - seña 4.500 = falta 10.500 exactos.
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
  },
}

/**
 * Agregar un cobro: el form arranca prefillado con el saldo pendiente, pero
 * acá se pisa con un monto propio para probar la conversión pesos → centavos
 * que hace el componente antes de llamar la action.
 */
export const AgregarCargo: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: '+ Agregar cobro' }))
    const amountInput = canvas.getByLabelText('Monto (ARS)')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '5000')
    // "Medio de pago" también nombra el <select> nativo sr-only detrás del
    // trigger (mismo texto en <label htmlFor> y en el aria-label del botón):
    // getByLabelText matchea los dos. La interacción real es con el botón
    // visible (Popover), no con el select oculto.
    await userEvent.click(canvas.getByRole('button', { name: 'Medio de pago' }))
    await userEvent.click(await body.findByRole('button', { name: 'Transferencia' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Registrar cobro' }))

    // $5.000 en pesos → 500.000 centavos: el número exacto que tiene que viajar al servidor.
    await waitFor(() =>
      expect(args.addBookingChargeAction).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: BOOKING_ID, amount: 500_000, method: 'transfer' }),
      ),
    )
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
    // El form se cierra solo tras el éxito: vuelve a aparecer el botón de abrirlo.
    await expect(await canvas.findByRole('button', { name: '+ Agregar cobro' })).toBeVisible()

    // El toast (variant success) sobrevive al cambio de story (store a nivel de
    // módulo): cerrarlo acá evita que la siguiente story lo agarre a mitad de la
    // animación de salida (mismo patrón que CanteenQuickSale.stories.tsx).
    const toastText = await body.findByText('Cobro registrado')
    const toastItem = toastText.closest('li')
    if (!toastItem) throw new Error('No se encontró el toast')
    await userEvent.click(within(toastItem).getByRole('button', { name: 'Cerrar' }))
    // El default de waitForElementToBeRemoved (1000ms) alcanza sobrado en
    // condiciones normales (el setTimeout interno de dismiss() es de 200ms),
    // pero bajo carga completa de la batería de stories medí timeouts reales
    // acá: timeout explícito más generoso (mismo criterio que los
    // findByRole('dialog', {}, { timeout: 15_000 }) de AbonadosList.stories.tsx
    // para diálogos que entran por next/dynamic).
    await expectGone(toastText, { timeout: 5000 })
  },
}

/** El servidor rechaza el cobro (ej. caja del día ya cerrada): error inline, el form no se cierra. */
export const ErrorDelServidor: Story = {
  args: {
    addBookingChargeAction: fn(
      async (): Promise<BookingChargeActionResult> => ({
        success: false,
        error: 'La caja de hoy ya fue cerrada. Registrá el cobro como ajuste en Caja.',
      }),
    ),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '+ Agregar cobro' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Registrar cobro' }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya fue cerrada/i)
    await expect(args.addBookingChargeAction).toHaveBeenCalled()
    // El form sigue abierto: "Registrar cobro" sigue en pantalla, no volvió "+ Agregar cobro".
    await expect(canvas.getByRole('button', { name: 'Registrar cobro' })).toBeVisible()
  },
}
