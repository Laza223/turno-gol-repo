import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { Banknote } from 'lucide-react'
import { MetricCard } from './metric-card'

/** Mismo fondo que dashboard/page.tsx: KPIs sobre `content-area-gradient` en un grid de 4. */
const meta = {
  title: 'Admin/Dashboard/MetricCard',
  component: MetricCard,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } },
  },
  decorators: [
    (Story) => (
      <div className="content-area-gradient max-w-xs rounded-xl p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Caja de hoy',
    value: '$ 45.000',
    icon: <Banknote className="h-5 w-5" aria-hidden="true" />,
    sub: 'Ingresos $ 60.000 · Egresos $ 15.000',
  },
} satisfies Meta<typeof MetricCard>

export default meta
type Story = StoryObj<typeof meta>

/** Sin `href`: card estática, no navega. */
export const SinLink: Story = {}

/** Con `href`: la card entera es un `<Link>` (Fitts) que navega a la vista de detalle. */
export const ConLink: Story = {
  args: { href: '/caja', ariaLabel: 'Caja de hoy: $ 45.000 — ver caja' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', { name: 'Caja de hoy: $ 45.000 — ver caja' })
    await expect(link).toHaveAttribute('href', '/caja')
  },
}

export const AccentAmber: Story = {
  args: {
    accent: 'amber',
    label: 'Pagando ahora',
    value: '3',
    sub: '$ 13.500 en señas por acreditar',
  },
}

export const AccentRed: Story = {
  args: {
    accent: 'red',
    label: 'Jugadores bloqueados',
    value: '2',
    sub: 'Por ausencias reiteradas u otros motivos',
  },
}
