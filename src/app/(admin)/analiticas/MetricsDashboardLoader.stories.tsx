import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { systemStatusOk, tenantMetrics } from '@/test/fixtures/metrics'
import { MetricsDashboardLoader } from './MetricsDashboardLoader'

/**
 * Wrapper `React.lazy` + `Suspense` que mantiene recharts (~100kB gz) fuera del bundle
 * compartido. La story prueba lo único que el wrapper aporta: que el import dinámico
 * resuelve y el dashboard llega a montar. Si alguien rompe la ruta del `lazy()`, esto se
 * pone rojo — el typecheck no lo agarraría (el import dinámico se resuelve en runtime).
 *
 * QUÉ **NO** CUBRE, Y POR QUÉ (dicho acá y no escondido en el inventario):
 *
 * 1. `DashboardSkeleton` (el fallback del Suspense). Solo se ve mientras BAJA EL CHUNK
 *    de JS. En el runner el chunk ya está en memoria, así que la ventana es de cero
 *    frames: no hay forma determinista de pescarlo. La única manera de storyearlo sería
 *    exportarlo — o sea, cambiar código de producción para que exista una story, que es
 *    exactamente lo que este trabajo se comprometió a no hacer. Queda sin cubrir, a
 *    propósito y por escrito.
 *
 * 2. Los estados internos del dashboard (vacío, error, sin panel de sistema). Son de
 *    `MetricsDashboard`, y ya tienen sus 4 stories propias. Repetirlos acá sería inflar
 *    el número sin agregar una sola aserción nueva.
 *
 * OJO CON RECHARTS: el loader NO reenvía `isAnimationActive`, así que acá el dashboard
 * monta con la animación de recharts prendida (default `true`). Recharts anima en JS, no
 * en CSS, así que el `prefers-reduced-motion` del runner NO la apaga. Por eso el `play`
 * asertea solo TEXTO ya montado y nunca pixeles ni geometría del SVG: lo contrario sería
 * una carrera contra el tween.
 */
const meta = {
  title: 'Admin/Metricas/MetricsDashboardLoader',
  component: MetricsDashboardLoader,
  parameters: {
    layout: 'padded',
    // Los fetch son del MetricsDashboard de adentro: el loader no fetchea nada, pero sin
    // estos mocks el hijo pega contra la red de verdad al montar.
    fetchMock: [
      { match: '/api/admin/metrics', json: { data: tenantMetrics() } },
      { match: '/api/admin/system-status', json: { data: systemStatusOk() } },
    ],
  },
  args: { canSeeSystem: true },
} satisfies Meta<typeof MetricsDashboardLoader>

export default meta
type Story = StoryObj<typeof meta>

/** El chunk lazy resuelve y el dashboard monta con datos. */
export const CargaElDashboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // findByText: hay que esperar al import dinámico. Un getByText sincrónico correría
    // contra la resolución del chunk y ganaría o perdería según la carga de la máquina.
    await expect(await canvas.findByText('Reservas por día')).toBeVisible()
    await expect(await canvas.findByText('Estado del sistema')).toBeVisible()
    // El skeleton ya no está: el Suspense soltó el fallback.
    await expect(canvas.queryByRole('status', { name: 'Cargando métricas' })).not.toBeInTheDocument()
  },
}
