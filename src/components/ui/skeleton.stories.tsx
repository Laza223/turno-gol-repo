import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { withPortalGlass } from '../../../.storybook/decorators/with-portal-glass'
import { Skeleton } from './skeleton'

/**
 * Placeholder de carga (`.skeleton`, shimmer CSS de globals.css). Se usa
 * como bloque suelto de distintos tamaños dentro de los `loading.tsx` de
 * cada sección — no tiene contenedor propio más allá del `className` que le
 * pase el caller.
 */
const meta = {
  title: 'Design System/Skeleton',
  component: Skeleton,
  parameters: { layout: 'centered' },
  args: { className: 'h-6 w-48' },
} satisfies Meta<typeof Skeleton>

export default meta
type Story = StoryObj<typeof meta>

/** `role="status"` + `aria-label="Cargando…"` por default — anunciado a lectores de pantalla. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const status = canvas.getByRole('status', { name: 'Cargando…' })
    await expect(status).toHaveAttribute('aria-busy', 'true')
  },
}

export const LabelPersonalizado: Story = {
  args: { label: 'Cargando reservas…' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status', { name: 'Cargando reservas…' })).toBeInTheDocument()
  },
}

/** Decorativo: sin `role`/`aria-label`, para no duplicar el anuncio cuando ya hay un skeleton "ancla" con label en la misma sección. */
export const Decorativo: Story = {
  args: { 'aria-hidden': true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
  },
}

/** Composición típica: varias filas de distinto ancho, como en un `loading.tsx`. */
export const Composicion: Story = {
  render: () => (
    <div className="w-72 space-y-3">
      <Skeleton className="h-8 w-40" label="Cargando encabezado…" />
      <Skeleton className="h-4 w-full" aria-hidden />
      <Skeleton className="h-4 w-5/6" aria-hidden />
      <Skeleton className="h-4 w-3/4" aria-hidden />
    </div>
  ),
}

/**
 * Portal de vidrio: el esqueleto tiene la forma de la tarjeta que viene, en vidrio, con un brillo
 * que cruza (1,4 s). Con "reducir movimiento" queda quieto.
 */
export const PortalVidrio: Story = {
  decorators: [withPortalGlass()],
  render: () => (
    <div className="grid w-80 gap-3">
      <Skeleton variant="glass" className="h-40" label="Cargando complejos…" />
      <Skeleton variant="glass" className="h-24" aria-hidden />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const status = canvas.getByRole('status', { name: 'Cargando complejos…' })
    await expect(status).toHaveClass('skeleton-glass')
    await expect(status).not.toHaveClass('skeleton')
  },
}
