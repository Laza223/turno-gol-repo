import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import BusinessFooter from './BusinessFooter'

/**
 * Fondo `#020617` hardcodeado — superficie SIEMPRE oscura (landing B2B
 * `/para-complejos`), independiente del theme del viewer. No hay estados: es
 * estático.
 *
 * El shell real (src/app/(business)/layout.tsx) envuelve TODO en
 * `className="dark"` — sin eso, `dark:text-emerald-400` del Logo no aplica
 * cuando el theme del viewer es claro (default) y "Gol" queda en
 * `text-emerald-700` sobre #020617 → 3.67:1, bajo AA. Reproducir el wrapper acá.
 */
const meta = {
  title: 'Public/BusinessFooter',
  component: BusinessFooter,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="dark" style={{ background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BusinessFooter>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
