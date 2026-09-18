import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CuotaSection } from './CuotaSection'

/**
 * La cuota del complejo con precio por cancha (decisión 2026-09-17): $47.000
 * la primera + $30.000 cada extra, anual 10% off. Los parámetros llegan por
 * prop desde la fila activa de `plans`; acá se fijan a mano con los valores
 * vigentes para que un cambio accidental en el cálculo se vea en el número.
 */
const pricing = {
  priceFirstCourtCents: 4_700_000,
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
    await expect(canvas.getAllByText(/47\.000/).length).toBeGreaterThan(0)
  },
}

/** 5 canchas: $47.000 + 4 × $30.000 = $167.000 por mes. */
export const ActivarCincoCanchas: Story = {
  args: { onlineCourts: 5, billedCourts: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(/167\.000/).length).toBeGreaterThan(0)
  },
}

/** Anual con 5 canchas: 10% off sobre $167.000 = $150.300 por mes, cobrado una vez por año. */
export const ActivarCincoCanchasAnual: Story = {
  args: { onlineCourts: 5, billedCourts: 5, billingCycle: 'annual' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(/150\.300/).length).toBeGreaterThan(0)
  },
}

/** Sin techo: 12 canchas = $47.000 + 11 × $30.000 = $377.000 por mes. */
export const ActivarDoceCanchas: Story = {
  args: { onlineCourts: 12, billedCourts: 12 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(/377\.000/).length).toBeGreaterThan(0)
  },
}

/** El "−" no baja de las canchas prendidas: facturar por menos sería operar de más pagando de menos. */
export const NoBajaDeLasCanchasPrendidas: Story = {
  args: { onlineCourts: 5, billedCourts: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Quitar una cancha' }))
    await expect(canvas.getAllByText(/167\.000/).length).toBeGreaterThan(0)
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
    await expect(canvas.getAllByText(/197\.000/).length).toBeGreaterThan(0)
  },
}
