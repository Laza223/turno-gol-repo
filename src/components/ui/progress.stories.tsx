import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { Progress, SegmentedProgress } from './progress'

/**
 * Barra de progreso. Track `bg-muted`, relleno `bg-primary` — el token ya viene
 * calibrado (emerald-700 en light, emerald-500 en dark), así que contrasta en los
 * dos temas sin tabla de excepciones.
 */
const meta = {
  title: 'Design System/Progress',
  component: Progress,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  args: { value: 50 },
} satisfies Meta<typeof Progress>

export default meta
type Story = StoryObj<typeof meta>

/** Sin `label` es decorativa: no se anuncia. Es el caso normal cuando hay un texto al lado que ya dice el progreso. */
export const Decorativa: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument()
  },
}

/** Con `label` se anuncia como `progressbar` con su valor. */
export const ConLabel: Story = {
  args: { value: 50, label: 'Progreso del onboarding' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bar = canvas.getByRole('progressbar', { name: 'Progreso del onboarding' })
    await expect(bar).toHaveAttribute('aria-valuenow', '50')
    await expect(bar).toHaveAttribute('aria-valuemax', '100')
  },
}

export const Vacia: Story = { args: { value: 0 } }

export const Completa: Story = {
  args: { value: 100, label: 'Listo' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  },
}

/** Un valor fuera de rango se recorta en vez de romper el layout. */
export const FueraDeRango: Story = {
  args: { value: 180, label: 'Recortado' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  },
}

export const Fina: Story = { args: { value: 65, size: 'sm' } }

/** Segmentos discretos: la forma correcta cuando los pasos son contables. */
export const Segmentada: StoryObj = {
  render: () => <SegmentedProgress total={4} completed={2} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument()
  },
}

export const SegmentadaConLabel: StoryObj = {
  render: () => <SegmentedProgress total={4} completed={3} label="Paso 3 de 4" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bar = canvas.getByRole('progressbar', { name: 'Paso 3 de 4' })
    await expect(bar).toHaveAttribute('aria-valuenow', '3')
    await expect(bar).toHaveAttribute('aria-valuemax', '4')
  },
}
