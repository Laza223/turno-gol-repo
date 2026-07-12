import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import { MockCheckoutView, type MockBookingSummary } from './MockCheckoutView'

/**
 * Simulador de MercadoPago (`MP_MOCK_MODE=1`, harness de dev/e2e — no product
 * real, pero renderiza UI real que vale QA visual). `mockPay`/`mockReject`/
 * `mockCancel` son Server Actions reales, inyectadas como prop (`payAction`/
 * `rejectAction`/`cancelAction`), nunca importadas de `./actions`.
 */
const bookingSummary = (overrides: Partial<MockBookingSummary> = {}): MockBookingSummary => ({
  deposit_amount: 450000,
  date: '2026-03-14',
  time_start: '21:00:00',
  time_end: '22:00:00',
  court_name: 'Cancha 1',
  tenant_name: 'Complejo Fénix',
  tenant_id: uid(1),
  ...overrides,
})

const meta = {
  title: 'Misc/MockMp/MockCheckoutView',
  component: MockCheckoutView,
  parameters: { layout: 'fullscreen' },
  args: {
    booking: bookingSummary(),
    bookingId: uid(1001),
    payAction: fn(async () => {}),
    rejectAction: fn(async () => {}),
    cancelAction: fn(async () => {}),
  },
} satisfies Meta<typeof MockCheckoutView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Seña más alta (cancha de Fútbol 11, precio flat). */
export const SeñaAlta: Story = {
  args: {
    booking: bookingSummary({ deposit_amount: 540000, court_name: 'Cancha 3 - Fútbol 11', time_start: '11:00:00', time_end: '12:00:00' }),
  },
}

/** "Pagar (aprobado)" dispara `payAction` con el `bookingId` en el FormData. */
export const PagoAprobado: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Pagar (aprobado)' }))
    await expect(args.payAction).toHaveBeenCalledTimes(1)
  },
}

/** "Pago rechazado" dispara `rejectAction`. */
export const PagoRechazado: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Pago rechazado' }))
    await expect(args.rejectAction).toHaveBeenCalledTimes(1)
  },
}

/** "Cancelar" dispara `cancelAction`. */
export const Cancelar: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(args.cancelAction).toHaveBeenCalledTimes(1)
  },
}
