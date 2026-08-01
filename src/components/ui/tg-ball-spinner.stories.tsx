import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TgBallSpinner } from './tg-ball-spinner'

const meta: Meta<typeof TgBallSpinner> = {
  title: 'Design System/TgBallSpinner',
  component: TgBallSpinner,
  parameters: { layout: 'centered' },
  argTypes: {
    size: { control: 'radio', options: ['xs', 'sm', 'md', 'lg'] },
    text: { control: 'text' },
    label: { control: 'text' },
  },
}
export default meta
type Story = StoryObj<typeof TgBallSpinner>

export const Default: Story = {
  args: { size: 'md' },
}

export const ConTexto: Story = {
  args: { size: 'md', text: 'Cargando reservas…' },
}

export const Grande: Story = {
  args: { size: 'lg', text: 'Preparando grilla…' },
}

export const Chico: Story = {
  args: { size: 'sm' },
}

/** Simula el uso como full-page loading. */
export const FullPage: Story = {
  args: { size: 'lg', text: 'Cargando…' },
  decorators: [
    (Story: React.ComponentType) => (
      <div className="flex h-[400px] w-full items-center justify-center rounded-xl bg-card">
        <Story />
      </div>
    ),
  ],
}

/** Los cuatro tamaños lado a lado. */
export const Comparacion: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <TgBallSpinner size="xs" text="xs" />
      <TgBallSpinner size="sm" text="sm" />
      <TgBallSpinner size="md" text="md" />
      <TgBallSpinner size="lg" text="lg" />
    </div>
  ),
}

/** `xs` es la variante inline: vive DENTRO de un botón, con rebote corto y sin
 *  sombra de piso para no escaparse del recorte. */
export const InlineEnBoton: Story = {
  render: () => (
    <button
      type="button"
      disabled
      className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white opacity-90"
    >
      <TgBallSpinner size="xs" className="mr-2" aria-hidden />
      Procesando…
    </button>
  ),
}
