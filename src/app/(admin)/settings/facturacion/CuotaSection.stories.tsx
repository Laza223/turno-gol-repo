import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CuotaSection } from './CuotaSection'

/**
 * La cuota del complejo con precio por cancha (decisión 2026-10-02): $30.000
 * cada cancha, anual 10% off. Los parámetros llegan por
 * prop desde la fila activa de `plans`; acá se fijan a mano con los valores
 * vigentes para que un cambio accidental en el cálculo se vea en el número.
 */
const pricing = {
  priceFirstCourtCents: 3_000_000,
  priceExtraCourtCents: 3_000_000,
  annualDiscountBps: 1000,
}

const meta = {
  title: 'Settings/Facturacion/CuotaSection',
  component: CuotaSection,
  parameters: { layout: 'padded' },
  args: {
    pricing,
    mode: 'activate',
    onlineCourts: 1,
    billedCourts: 1,
  },
} satisfies Meta<typeof CuotaSection>

export default meta
type Story = StoryObj<typeof meta>

/** Una sola cancha: la cuota es solo el servicio, sin línea de extras. */
export const ActivarUnaCancha: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(/30\.000/).length).toBeGreaterThan(0)
  },
}

/** 5 canchas: $30.000 × 5 = $150.000 por mes. */
export const ActivarCincoCanchas: Story = {
  args: { onlineCourts: 5, billedCourts: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(/150\.000/).length).toBeGreaterThan(0)
  },
}

/** Anual con 5 canchas: 10% off sobre $150.000 = $135.000 por mes, cobrado una vez por año. */
export const ActivarCincoCanchasAnual: Story = {
  args: { onlineCourts: 5, billedCourts: 5, billingCycle: 'annual' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(/135\.000/).length).toBeGreaterThan(0)
  },
}

/** Sin techo: 12 canchas = $30.000 × 12 = $360.000 por mes. */
export const ActivarDoceCanchas: Story = {
  args: { onlineCourts: 12, billedCourts: 12 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(/360\.000/).length).toBeGreaterThan(0)
  },
}

/** El "−" no baja de las canchas prendidas: facturar por menos sería operar de más pagando de menos. */
export const NoBajaDeLasCanchasPrendidas: Story = {
  args: { onlineCourts: 5, billedCourts: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Quitar una cancha' }))
    await expect(canvas.getAllByText(/150\.000/).length).toBeGreaterThan(0)
  },
}

/** Suscripción activa con una cancha más agendada para el próximo cobro. */
export const GestionarConCambioAgendado: Story = {
  args: {
    mode: 'manage',
    onlineCourts: 5,
    billedCourts: 5,
    pendingBilledCourts: 6,
    periodEnd: '2026-10-17T03:00:00.000Z',
    billingCycle: 'monthly',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(/180\.000/).length).toBeGreaterThan(0)
  },
}
