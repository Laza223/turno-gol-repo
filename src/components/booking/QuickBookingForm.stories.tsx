import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { QuickBookingForm } from './QuickBookingForm'

/**
 * Alta rápida desde la grilla — Fase 3, criterio de salida #3: ≤3 campos
 * visibles, precio pre-calculado, Enter confirma.
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
    action: fn(async () => ({ success: true as const, booking: { id: 'nueva' } as never })),
    searchPlayersAction: fn(async () => ({ success: true as const, players: [] })),
    onSuccess: fn(),
    onMoreOptions: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof QuickBookingForm>

export default meta
type Story = StoryObj<typeof meta>

/**
 * El caso del 90%: alguien llama, se tipea el nombre, se dice qué se cobró.
 * Ninguna opción de cobro viene marcada: es una pregunta, no un default.
 */
export const Base: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByLabelText('¿A nombre de quién?')).toBeTruthy()
    // El precio se muestra ya resuelto — no es un campo.
    await expect(await c.findByText(/24\.000/)).toBeTruthy()
    for (const opcion of await c.findAllByRole('radio')) {
      await expect(opcion.getAttribute('aria-checked')).toBe('false')
    }
    // Sin método elegido no hay monto que tipear.
    await expect(c.queryByLabelText('Cuánto cobraste')).toBeNull()
  },
}

/**
 * El turno no se crea sin decir qué pasó con la plata. Antes se podía confirmar
 * sin tocar el control y el turno nacía sin cobro registrado por inercia, no
 * por decisión.
 */
export const SinDecirQueCobro: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.type(await c.findByLabelText('¿A nombre de quién?'), 'Marce')
    await userEvent.click(await c.findByRole('button', { name: /Confirmar reserva/ }))

    await expect(await c.findByText(/Decí si cobraste algo/)).toBeTruthy()
    await expect(args.action).not.toHaveBeenCalled()
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
    const confirmar = await c.findByRole('button', { name: /Confirmar reserva/ })
    await expect((confirmar as HTMLButtonElement).disabled).toBe(true)
  },
}
