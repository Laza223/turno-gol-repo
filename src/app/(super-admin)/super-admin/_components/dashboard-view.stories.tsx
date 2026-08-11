import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import {
  dashboardData,
  dashboardDataEmpty,
  dashboardDataQueuesDown,
} from '@/test/fixtures/super-admin'
import { SuperAdminDashboardView } from './dashboard-view'

/**
 * Cuerpo del dashboard global de super-admin (extraído de page.tsx —
 * `getDashboardData` mezclaba fetch con esta vista tipada de ~150 líneas).
 * `PageHeader` queda en la page: no depende de `data`.
 */
const meta = {
  title: 'SuperAdmin/Dashboard/SuperAdminDashboardView',
  component: SuperAdminDashboardView,
  parameters: { layout: 'padded' },
  args: { data: dashboardData() },
} satisfies Meta<typeof SuperAdminDashboardView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Plataforma recién lanzada: 0 tenants, 0 MRR, cada sección en su empty state. */
export const Vacio: Story = {
  args: { data: dashboardDataEmpty() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ningún trial vence en los próximos 7 días.')).toBeInTheDocument()
    await expect(canvas.getByText('Sin signups en los últimos 7 días.')).toBeInTheDocument()
    await expect(canvas.getByText('Sin webhooks registrados todavía.')).toBeInTheDocument()
  },
}

/** pg-boss no pudo arrancar: cada cola degrada a "no disponible" en vez de romper la página. */
export const ColasNoDisponibles: Story = {
  args: { data: dashboardDataQueuesDown() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('no disponible').length).toBeGreaterThan(0)
  },
}
