import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { pulsoDashboard, pulsoDashboardEmpty } from './pulso/pulso-fixtures'
import { SuperAdminDashboardView } from './dashboard-view'

/**
 * Parte baja del Pulso (plata, altas, embudo y salud técnica). Los números de
 * arriba y "Pide atención" tienen sus stories en `pulso/pulso.stories.tsx`.
 */
const meta = {
  title: 'SuperAdmin/Pulso/DashboardView',
  component: SuperAdminDashboardView,
  parameters: { layout: 'padded' },
  args: { data: pulsoDashboard() },
} satisfies Meta<typeof SuperAdminDashboardView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ingreso mensual de suscripciones')).toBeInTheDocument()
    // Los estados en cero no se dibujan.
    await expect(canvas.queryByText(/^Eliminado/)).not.toBeInTheDocument()
  },
}

/** Plataforma recién lanzada: cada sección dice que no hay nada, sin tarjetas rotas. */
export const Vacio: Story = {
  args: { data: pulsoDashboardEmpty() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hay complejos.')).toBeInTheDocument()
    await expect(
      canvas.getByText('No se dio de alta ningún complejo en los últimos 7 días.'),
    ).toBeInTheDocument()
  },
}

/** No se pudo leer el ingreso mensual: se muestra "—" y se dice por qué, nunca $0. */
export const IngresoNoDisponible: Story = {
  args: { data: pulsoDashboard({ mrrCents: null }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No se pudo leer ahora')).toBeInTheDocument()
  },
}
