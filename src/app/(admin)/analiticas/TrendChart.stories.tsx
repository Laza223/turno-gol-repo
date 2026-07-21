import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { periodTotals, revenueReport } from '@/test/fixtures/metrics'
import { TrendChart } from './ReportCharts'

/**
 * Comparativa mes actual vs mes anterior. `ReportesPage` solo la renderiza
 * cuando `report.prevPeriod` existe (mes con actividad previa) — nunca se
 * fabrica una comparativa contra cero, así que no hay estado "sin prevPeriod"
 * acá (ese caso es la ausencia total del chart, cubierto por ReportView).
 */
const meta = {
  title: 'Admin/Analiticas/ReportCharts/TrendChart',
  component: TrendChart,
  parameters: { layout: 'padded' },
  args: {
    current: { income: revenueReport().income, balance: revenueReport().balance },
    prev: periodTotals(),
    isAnimationActive: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrendChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Saldo negativo este mes vs un mes anterior positivo. */
export const SaldoNegativo: Story = {
  args: {
    current: { income: 12_000_000, balance: -3_500_000 },
    prev: periodTotals(),
  },
}
