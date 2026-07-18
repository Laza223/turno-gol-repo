import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import {
  tenantMetrics,
  tenantMetricsEmpty,
  systemStatusOk,
  systemStatusDbDown,
} from '@/test/fixtures/metrics'
import MetricsDashboard from './MetricsDashboard'

/**
 * `fetch('/api/admin/metrics')` + `fetch('/api/admin/system-status')` propios
 * en `useEffect` (con `setInterval(60000)`, que no se ejercita acá) — se
 * mockean vía `parameters.fetchMock` (decorator `with-fetch.tsx`, sin MSW).
 * `isAnimationActive={false}` (prop nueva, default true) para que las
 * capturas de recharts sean deterministas.
 *
 * Dos estados del inventario quedan afuera a propósito: "cargando" es una
 * ventana de un microtask entre el mount y el resolve del fetch mockeado
 * (sincrónico), imposible de capturar de forma determinista sin cambiar el
 * contrato del componente; "error con datos previos" requiere que el
 * `setInterval` de 60s falle DESPUÉS de un primer fetch exitoso — el
 * componente no expone un refresh manual ni el intervalo como prop, así que
 * no hay forma de dispararlo sin esperar 60s reales.
 */
const meta = {
  title: 'Admin/Metricas/MetricsDashboard',
  component: MetricsDashboard,
  parameters: {
    layout: 'padded',
    fetchMock: [
      { match: '/api/admin/metrics', json: { data: tenantMetrics() } },
      { match: '/api/admin/system-status', json: { data: systemStatusOk() } },
    ],
  },
  args: { canSeeSystem: true, isAnimationActive: false },
} satisfies Meta<typeof MetricsDashboard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Reservas por día')).toBeVisible()
    await expect(canvas.getByText('Estado del sistema')).toBeVisible()
    // Las 2 fetches (metrics, system-status) van en secuencia dentro de
    // load(): "Reservas por día" ya renderizó con la 1ra, pero la 2da puede
    // seguir en vuelo — findByText espera a que resuelva.
    await expect(await canvas.findByText('Operativa · 12 ms')).toBeVisible()
  },
}

/** El manager ve sus métricas pero no el panel de observabilidad del sistema (solo admin). */
export const SinPanelDeSistema: Story = {
  args: { canSeeSystem: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Reservas por día')).toBeVisible()
    await expect(canvas.queryByText('Estado del sistema')).not.toBeInTheDocument()
  },
}

/** La base de datos está caída: el panel degrada a "Caída" en vez de romper. */
export const SistemaCaido: Story = {
  parameters: {
    fetchMock: [
      { match: '/api/admin/metrics', json: { data: tenantMetrics() } },
      { match: '/api/admin/system-status', json: { data: systemStatusDbDown() } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Caída')).toBeVisible()
  },
}

/** `/api/admin/metrics` devuelve 500 y nunca hubo datos previos: banner de error, sin dashboard. */
export const ErrorSinDatosPrevios: Story = {
  parameters: {
    fetchMock: [{ match: '/api/admin/metrics', json: { error: 'internal' }, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('No pudimos cargar las métricas. Probá de nuevo en unos segundos.'),
    ).toBeVisible()
  },
}

/** Complejo recién arrancado: series en cero, sin top-5 horarios → ghost + CTA a la grilla. */
export const SinDatos: Story = {
  parameters: {
    fetchMock: [
      { match: '/api/admin/metrics', json: { data: tenantMetricsEmpty() } },
      { match: '/api/admin/system-status', json: { data: systemStatusOk() } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('Así se van a ver tus horarios más reservados.'),
    ).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'Cargá tu primera reserva desde la grilla' }),
    ).toHaveAttribute('href', '/grilla')
  },
}

/** Ausencias en alza vs el período anterior: flecha roja "+N pts". */
export const TendenciaAusenciasEnAlza: Story = {
  parameters: {
    fetchMock: [
      {
        match: '/api/admin/metrics',
        json: {
          data: tenantMetrics({
            noShow: { noShow: 20, completed: 130, finished: 150, rate: 20 / 150 },
            noShowPrev: { noShow: 8, completed: 142, finished: 150, rate: 8 / 150 },
          }),
        },
      },
      { match: '/api/admin/system-status', json: { data: systemStatusOk() } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/pts vs período anterior/)).toHaveTextContent('+8 pts vs período anterior')
  },
}

/** Sin período anterior comparable (complejo nuevo): sin flecha, "sin datos previos". */
export const TendenciaSinDatosPrevios: Story = {
  parameters: {
    fetchMock: [
      {
        match: '/api/admin/metrics',
        json: {
          data: tenantMetrics({ noShowPrev: { noShow: 0, completed: 0, finished: 0, rate: 0 } }),
        },
      },
      { match: '/api/admin/system-status', json: { data: systemStatusOk() } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('sin datos previos')).toBeVisible()
  },
}

/** Toggle día/semana/mes del gráfico de ingresos (agregación client-side). */
export const CambiarGranularidad: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Ingresos')
    const monthBtn = canvas.getByRole('button', { name: 'Mes' })
    await userEvent.click(monthBtn)
    await waitFor(() => expect(monthBtn).toHaveAttribute('aria-pressed', 'true'))
    await expect(canvas.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'false')
  },
}
