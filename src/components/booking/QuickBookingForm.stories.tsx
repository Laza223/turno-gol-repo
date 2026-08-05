import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { QuickBookingForm } from './QuickBookingForm'

/**
 * Alta rápida desde la grilla — Fase 3, criterio de salida #3: ≤3 campos
 * visibles, precio pre-calculado, Enter confirma.
 *
 * Las stories son una por rama de lo que decide el formulario: hay precio o no,
 * el complejo sugiere seña o no, y el turno se ocupó mientras el popover estaba
 * abierto. Las tres cambian lo que el admin PUEDE hacer, que es donde está el
 * riesgo (pre-cargar $0 y después rechazar el submit fue un bug real).
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
    depositPercentage: 30,
    action: fn(async () => ({ success: true as const, booking: { id: 'nueva' } as never })),
    searchPlayersAction: fn(async () => ({ success: true as const, players: [] })),
    onSuccess: fn(),
    onMoreOptions: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof QuickBookingForm>

export default meta
type Story = StoryObj<typeof meta>

/** El caso del 90%: alguien llama, se tipea el nombre y Enter. */
export const Base: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByLabelText('¿A nombre de quién?')).toBeTruthy()
    // El precio se muestra ya resuelto — no es un campo.
    await expect(await c.findByText(/24\.000/)).toBeTruthy()
    await expect(await c.findByText(/sugerida/)).toBeTruthy()
  },
}

/**
 * Complejo con `deposit_percentage: 0` (no pide seña online — config válida).
 * No hay sugerencia: el campo arranca vacío en vez de en $0, que era un
 * callejón sin salida (el submit rechaza montos de $0).
 */
export const SinPorcentajeDeSena: Story = {
  args: { depositPercentage: 0 },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.queryByText(/sugerida/)).toBeNull()
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
