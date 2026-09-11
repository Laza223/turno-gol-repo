import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { QuickBookingForm } from './QuickBookingForm'

/**
 * Alta rápida desde la grilla: UN campo a la vista, precio ya resuelto, Enter
 * confirma.
 *
 * Las stories son una por rama de lo que decide el formulario: hay precio o no,
 * contestó lo que cobró o no, y el turno se ocupó mientras el popover estaba
 * abierto. Todas cambian lo que el admin PUEDE hacer, que es donde está el
 * riesgo (pre-cargar un monto y crear un turno "pagado completo" de un click
 * fue un bug real).
 *
 * Las Server Actions llegan por prop: importarlas arrastraría `node:async_hooks`
 * y rompería el bundle de Storybook.
 */
const meta = {
  title: 'Booking/Grid/QuickBookingForm',
  component: QuickBookingForm,
  parameters: { layout: 'centered' },
  args: {
    slot: {
      courtId: 'court-1',
      courtName: 'Cancha 1',
      date: '2026-08-05',
      timeStart: '20:00',
      timeEnd: '21:00',
    },
    price: 2400000,
    action: fn(async () => ({
      success: true as const,
      booking: { id: 'nueva' } as never,
    })),
    searchPlayersAction: fn(async () => ({ success: true as const, players: [] })),
    onSuccess: fn(),
    onMoreOptions: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof QuickBookingForm>

export default meta
type Story = StoryObj<typeof meta>

/**
 * El caso del 90%: alguien llama, se tipea el nombre, y listo. El teléfono y el
 * cobro arrancan plegados — ninguno hace falta para cargar el turno.
 */
export const Base: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByLabelText('¿A nombre de quién?')).toBeTruthy()
    // El precio se muestra ya resuelto — no es un campo.
    await expect(await c.findByText(/24\.000/)).toBeTruthy()
    // Un solo campo a la vista: lo demás está detrás de su enlace.
    await expect(c.queryByLabelText(/^Teléfono/)).toBeNull()
    await expect(c.queryByRole('radio')).toBeNull()
    await expect(await c.findByRole('button', { name: /Agregar teléfono/ })).toBeTruthy()
    await expect(await c.findByRole('button', { name: /Cobrar algo ahora/ })).toBeTruthy()
  },
}

/**
 * H102: el teléfono existe, es opcional y no frena nada. Se despliega solo
 * cuando el complejo lo quiere cargar.
 */
export const TelefonoDesplegado: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /Agregar teléfono/ }))
    await expect(await c.findByLabelText(/^Teléfono/)).toBeTruthy()
    await expect(await c.findByText('(opcional)')).toBeTruthy()
  },
}

/**
 * "No cobré" viene preseleccionado al desplegar el cobro (pedido del dueño,
 * revierte PR #185): desplegarlo no obliga a contestar nada.
 */
export const CobroDesplegado: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /Cobrar algo ahora/ }))
    for (const opcion of await c.findAllByRole('radio')) {
      const esperado = opcion.textContent === 'No cobré' ? 'true' : 'false'
      await expect(opcion.getAttribute('aria-checked')).toBe(esperado)
    }
    // Sin método elegido no hay monto que tipear.
    await expect(c.queryByLabelText('Cuánto cobraste')).toBeNull()
  },
}

/**
 * Confirmar sin tocar el control de cobro (solo el nombre) crea el turno: la
 * preselección en "No cobré" no manda ningún campo de seña al server. El
 * teléfono (H102) tampoco frena nada sin tocarlo: no viaja al server.
 */
export const ConfirmaSoloConElNombre: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.type(await c.findByLabelText('¿A nombre de quién?'), 'Marce')
    await userEvent.click(await c.findByRole('button', { name: 'Reservar' }))

    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    const payload = (args.action as ReturnType<typeof fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >
    await expect(payload).not.toHaveProperty('depositMethod')
    await expect(payload).not.toHaveProperty('guestPhone')
  },
}

/**
 * Elegir un método abre el monto VACÍO. La regresión que cubre: se precargaba
 * con `settings.deposit_percentage`, que es la política del portal online — un
 * complejo con la seña en 100% creaba turnos pagados enteros sin tipear nada.
 */
export const MontoArrancaVacio: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /Cobrar algo ahora/ }))
    await userEvent.click(await c.findByRole('radio', { name: 'Efectivo' }))

    const monto = await c.findByLabelText('Cuánto cobraste')
    await expect((monto as HTMLInputElement).value).toBe('')
  },
}

/** Franja sin regla de precio configurada: se dice, no se inventa un $0. */
export const SinPrecioConfigurado: Story = {
  args: { price: null },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Sin precio')).toBeTruthy()
  },
}

/**
 * El turno se ocupó entre que se abrió el popover y ahora. `checkAvailability`
 * es fail-open, así que un `false` es señal POSITIVA: se bloquea el confirmar.
 */
export const TurnoYaTomado: Story = {
  args: {
    checkAvailabilityAction: fn(async () => ({ available: false })),
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/acaba de ser tomado/)).toBeTruthy()
    const confirmar = await c.findByRole('button', { name: 'Reservar' })
    await expect((confirmar as HTMLButtonElement).disabled).toBe(true)
  },
}
