import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { courtReports, courtReport } from '@/test/fixtures/metrics'
import { courtFutbol5 } from '@/test/fixtures/court'
import { OccupancyChart } from './ReportCharts'

/**
 * `ResponsiveContainer` (recharts) necesita un ancho definido del ancestro —
 * `layout: 'padded'` + un wrapper con `width` explícito, si no colapsa a 0×0.
 * `isAnimationActive={false}` (prop nueva, default true en la app real):
 * recharts anima en JS y `prefers-reduced-motion` no lo frena, así que cada
 * corrida daría una captura distinta.
 */
const meta = {
  title: 'Admin/Analiticas/ReportCharts/OccupancyChart',
  component: OccupancyChart,
  parameters: { layout: 'padded' },
  args: { byCourt: courtReports(), isAnimationActive: false },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OccupancyChart>

export default meta
type Story = StoryObj<typeof meta>

export const TresCanchas: Story = {}

/** Una sola cancha: la altura mínima (120px) evita que la barra quede aplastada. */
export const UnaCancha: Story = {
  args: { byCourt: [courtReport({ courtId: courtFutbol5().id, courtName: 'Cancha 1' })] },
}

/** 0% de ocupación: el mes recién arranca, sin reservas todavía en esa cancha. */
export const SinOcupacion: Story = {
  args: { byCourt: [courtReport({ occupancyPct: 0, bookingCount: 0 })] },
}
