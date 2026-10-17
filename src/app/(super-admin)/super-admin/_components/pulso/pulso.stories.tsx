import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PulsoAttention } from './pulso-attention'
import { PulsoFeed } from './pulso-feed'
import { pulsoActivity, pulsoActivityEmpty, pulsoDashboard } from './pulso-fixtures'
import { PulsoSeries } from './pulso-series'
import { ActivityTopSkeleton, FeedSkeleton, RestSkeleton } from './pulso-skeletons'
import { PulsoStats } from './pulso-stats'
import { PulsoUnavailable } from './pulso-unavailable'
import { WindowSwitch } from './window-switch'

/**
 * Parte de arriba del Pulso: períodos, los cuatro números, las series, lo que
 * pide atención y lo último. Una vista por story; la página arma el orden.
 */
const meta = {
  title: 'SuperAdmin/Pulso/Secciones',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Periodo: Story = {
  render: () => <WindowSwitch current="7d" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: '7 días' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  },
}

export const Numeros: Story = {
  render: () => <PulsoStats activity={pulsoActivity()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ayer: 3')).toBeInTheDocument()
  },
}

export const NumerosEnCero: Story = {
  render: () => <PulsoStats activity={pulsoActivityEmpty()} />,
}

export const Serie14Dias: Story = {
  render: () => <PulsoSeries series={pulsoActivity().series} />,
}

export const PideAtencion: Story = {
  render: () => <PulsoAttention data={pulsoDashboard()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Pide atención')).toBeInTheDocument()
  },
}

/** Sin nada pendiente la sección no se dibuja. */
export const NadaQueAtender: Story = {
  render: () => (
    <PulsoAttention
      data={pulsoDashboard({ expiringTrials: [], troubledTenants: [], failedJobs24h: null })}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Pide atención')).not.toBeInTheDocument()
  },
}

export const LoUltimo: Story = {
  render: () => <PulsoFeed activity={pulsoActivity()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Mateo Fernández').length).toBeGreaterThan(0)
  },
}

export const LoUltimoVacio: Story = {
  render: () => <PulsoFeed activity={pulsoActivityEmpty()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hubo reservas online.')).toBeInTheDocument()
  },
}

export const NoSePudoLeer: Story = {
  render: () => <PulsoUnavailable />,
}

export const Esqueletos: Story = {
  render: () => (
    <div className="space-y-6">
      <ActivityTopSkeleton />
      <FeedSkeleton />
      <RestSkeleton />
    </div>
  ),
}
