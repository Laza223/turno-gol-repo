import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import {
  tenantMetrics,
  tenantMetricsEmpty,
  systemStatusOk,
  systemStatusDbDown,
} from '@/test/fixtures/metrics'
import MetricsDashboard from './MetricsDashboard'

/**
 * La parte cliente de Métricas: "Últimos 30 días" (horarios y ausencias) y el
 * estado del sistema del superadmin. `fetch('/api/admin/metrics')` +
 * `fetch('/api/admin/system-status')` en `useEffect` (con `setInterval(60000)`,
 * que no se ejercita acá) — se mockean vía `parameters.fetchMock` (decorator
 * `with-fetch.tsx`, sin MSW).
 *
 * "Error con datos previos" queda afuera: requiere que el intervalo de 60 s
 * falle DESPUÉS de un primer fetch exitoso, y no hay forma de dispararlo sin
 * esperar 60 s reales.
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
  decorators: [
    (Story) => (
      <div className="grid max-w-xl grid-cols-1 gap-5">
        <Story />
      </div>
    ),
  ],
  args: { canSeeSystem: true, showRecent: true },
} satisfies Meta<typeof MetricsDashboard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Últimos 30 días')).toBeVisible()
    await expect(canvas.getByText('Horarios más pedidos')).toBeVisible()
    await expect(canvas.getByText('24 turnos')).toBeVisible()
    await expect(canvas.getByText('Estado del sistema')).toBeVisible()
    // Las 2 fetches (metrics, system-status) van en secuencia dentro de
    // load(): los 30 días ya renderizaron con la 1ra, pero la 2da puede
    // seguir en vuelo — findByText espera a que resuelva.
    await expect(await canvas.findByText('Operativa · 12 ms')).toBeVisible()
  },
}

/** El dueño ve sus métricas pero no el panel de observabilidad del sistema (solo superadmin de la plataforma). */
export const SinPanelDeSistema: Story = {
  args: { canSeeSystem: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Últimos 30 días')).toBeVisible()
    await expect(canvas.queryByText('Estado del sistema')).not.toBeInTheDocument()
  },
}

/**
 * Mes cerrado: los 30 días corridos son de "ahora" y no se muestran al lado de
 * agosto. El superadmin sigue viendo el estado del sistema.
 */
export const MesCerrado: Story = {
  args: { showRecent: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Operativa · 12 ms')).toBeVisible()
    await expect(canvas.queryByText('Últimos 30 días')).not.toBeInTheDocument()
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

/** `/api/admin/metrics` devuelve 500 y nunca hubo datos previos: aviso de error en lugar de la tarjeta. */
export const ErrorSinDatosPrevios: Story = {
  args: { canSeeSystem: false },
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

/**
 * Complejo bloqueado: `withTenant` corta con `TENANT_BLOCKED` y su propio
 * mensaje, y el panel lo muestra en vez del genérico de "probá de nuevo".
 *
 * El caso real es soporte impersonando: la impersonación bypassea el lock de
 * ciclo de vida en las páginas pero no en los route handlers, así que la
 * página carga entera y solo este panel falla. Con el mensaje genérico eso se
 * leía como una caída transitoria y no lo era — reintentar no desbloquea nada.
 */
export const ComplejoBloqueado: Story = {
  args: { canSeeSystem: false },
  parameters: {
    fetchMock: [
      {
        match: '/api/admin/metrics',
        json: { error: { code: 'TENANT_BLOCKED', message: 'El complejo está bloqueado.' } },
        status: 403,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('El complejo está bloqueado.')).toBeVisible()
    await expect(
      canvas.queryByText('No pudimos cargar las métricas. Probá de nuevo en unos segundos.'),
    ).not.toBeInTheDocument()
  },
}

/**
 * Complejo recién arrancado: sin turnos en 30 días la tarjeta no aparece. El
 * vacío lo dice el mes, sin los números de ejemplo de antes ("3,2%", barras
 * fantasma).
 */
export const SinDatos: Story = {
  args: { canSeeSystem: false },
  parameters: {
    fetchMock: [{ match: '/api/admin/metrics', json: { data: tenantMetricsEmpty() } }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.queryByRole('status', { name: 'Cargando métricas' })).toBeNull(),
    )
    await expect(canvas.queryByText('Últimos 30 días')).not.toBeInTheDocument()
    await expect(canvas.queryByText('3,2%')).not.toBeInTheDocument()
  },
}

/** Ausencias en alza vs los 30 días anteriores: flecha roja "+N pts". */
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
    await expect(await canvas.findByText(/pts vs los 30 días anteriores/)).toHaveTextContent(
      '+8 pts vs los 30 días anteriores',
    )
  },
}

/**
 * H174: muestra chica (< MIN_FINISHED_FOR_TREND turnos terminados en la
 * ventana actual) — la tasa real se sigue mostrando, pero sin flecha ni
 * color: una alarma calculada sobre 24 turnos no significa nada.
 */
export const TendenciaMuestraChica: Story = {
  parameters: {
    fetchMock: [
      {
        match: '/api/admin/metrics',
        json: {
          data: tenantMetrics({
            noShow: { noShow: 4, completed: 20, finished: 24, rate: 4 / 24 },
            noShowPrev: { noShow: 1, completed: 49, finished: 50, rate: 1 / 50 },
          }),
        },
      },
      { match: '/api/admin/system-status', json: { data: systemStatusOk() } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('Todavía no hay datos suficientes para comparar.'),
    ).toBeVisible()
    await expect(canvas.queryByText(/pts vs los 30 días anteriores/)).not.toBeInTheDocument()
  },
}

/** Sin turnos terminados en los 30 días anteriores (complejo nuevo): sin flecha. */
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
    await expect(await canvas.findByText('Sin datos de los 30 días anteriores.')).toBeVisible()
  },
}
