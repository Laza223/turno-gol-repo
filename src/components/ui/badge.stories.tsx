import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Badge } from './badge'

/**
 * Pill de estado. No tiene contenedor propio (`inline-flex` puro) — el uso
 * real (AbonadoForm.tsx "Libre"/"Ocupado") la coloca dentro de una card
 * blanca (`bg-card`), no sobre el fondo de página crudo. Con `--success`/
 * `--warning` el foreground pierde contraste sobre `bg-background` (canvas
 * slate más oscuro que una card) — reproducir el contenedor real evita un
 * falso positivo de axe que no existe en la app.
 */
const meta = {
  title: 'Design System/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  args: { children: 'Confirmada' },
  decorators: [
    (Story) => (
      <div className="rounded-lg border border-border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Secondary: Story = { args: { variant: 'secondary', children: 'Bloqueo' } }

export const Destructive: Story = { args: { variant: 'destructive', children: 'Ausente' } }

/** `--success`: usado para reservas confirmadas/jugadas, abonados activos. */
export const Success: Story = { args: { variant: 'success', children: 'Jugada' } }

/** `--warning`: usado para señas pendientes, abonados pausados. */
export const Warning: Story = { args: { variant: 'warning', children: 'Seña pendiente' } }

export const Outline: Story = { args: { variant: 'outline', children: 'Fútbol 5' } }

/** Las 6 variantes juntas — referencia rápida de paleta. */
export const Todas: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>default</Badge>
      <Badge variant="secondary">secondary</Badge>
      <Badge variant="destructive">destructive</Badge>
      <Badge variant="success">success</Badge>
      <Badge variant="warning">warning</Badge>
      <Badge variant="outline">outline</Badge>
    </div>
  ),
}
