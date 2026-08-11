import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Banknote } from 'lucide-react'
import { StatCard } from './StatCard'

/**
 * `.card-premium` es una superficie opaca propia (elevación en light, glass en
 * dark) — se reproduce igualmente el fondo `content-area-gradient` del área de
 * contenido admin (dashboard/page.tsx) porque así se ve en la app real.
 */
const meta = {
  title: 'Design System/StatCard',
  component: StatCard,
  parameters: { layout: 'padded' },
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
  },
} satisfies Meta<typeof StatCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ConDelta: Story = {
  args: { delta: { label: '+12% vs ayer', direction: 'up' } },
}

export const DeltaNegativo: Story = {
  args: { delta: { label: '-8% vs ayer', direction: 'down' } },
}

/** Egresos: subir (↑) es semánticamente MALO — `tone` desacopla el color del glifo. */
export const DeltaToneInvertido: Story = {
  args: { delta: { label: '+8% egresos', direction: 'up', tone: 'negative' } },
}

export const ConSub: Story = {
  args: { sub: 'Ingresos $ 60.000 · Egresos $ 15.000' },
}

export const SinIcono: Story = {
  args: { icon: undefined },
}

export const Accents: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        label="Emerald"
        value="42"
        accent="emerald"
        icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
      />
      <StatCard
        label="Violet"
        value="42"
        accent="violet"
        icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
      />
      <StatCard
        label="Amber"
        value="42"
        accent="amber"
        icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
      />
      <StatCard
        label="Sky"
        value="42"
        accent="sky"
        icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
      />
      <StatCard
        label="Red"
        value="42"
        accent="red"
        icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
      />
      <StatCard
        label="Slate"
        value="42"
        accent="slate"
        icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
      />
    </div>
  ),
  decorators: [
    (Story) => (
      <div className="content-area-gradient max-w-lg rounded-xl p-6">
        <Story />
      </div>
    ),
  ],
}
