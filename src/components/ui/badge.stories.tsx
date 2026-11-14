import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { withPortalGlass } from '../../../.storybook/decorators/with-portal-glass'
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

/**
 * Portal de vidrio: las etiquetas del portal (28 px, 13 px) sobre una tarjeta de vidrio pintado,
 * que es donde viven en la app. La de "lugar" va en el verde de cancha; aviso y riesgo, en ámbar y rosa.
 */
export const PortalEtiquetas: Story = {
  decorators: [withPortalGlass()],
  render: () => (
    <div className="glass-painted flex max-w-sm flex-wrap gap-2 rounded-3xl p-4">
      <Badge variant="glass">Libre</Badge>
      <Badge variant="glass-neutral">Fútbol 5</Badge>
      <Badge variant="glass-off">Cerrado</Badge>
      <Badge variant="glass-warn">Seña pendiente</Badge>
      <Badge variant="glass-bad">Cancelada</Badge>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const label of ['Libre', 'Fútbol 5', 'Cerrado', 'Seña pendiente', 'Cancelada']) {
      const tag = canvas.getByText(label)
      await expect(Math.round(tag.getBoundingClientRect().height)).toBe(28)
      await expect(getComputedStyle(tag).fontSize).toBe('13px')
    }
  },
}
