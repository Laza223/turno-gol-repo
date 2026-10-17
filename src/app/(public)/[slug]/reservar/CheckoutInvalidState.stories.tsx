import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import { CheckoutInvalidState } from './CheckoutStates'

/**
 * Reemplaza toda la pantalla de confirmar cuando algo no es válido (complejo sin reservas online,
 * datos faltantes, turno inexistente o ya no libre). Cada una dice qué pasó y adónde seguir; las
 * del turno llevan a la ficha con el día, la hora y el formato que eligió (la del "Volver").
 */
const meta = {
  title: 'Player/Checkout/CheckoutInvalidState',
  component: CheckoutInvalidState,
  parameters: { layout: 'fullscreen' },
  args: { slug: 'complejo-fenix' },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof CheckoutInvalidState>

export default meta
type Story = StoryObj<typeof meta>

export const ComplejoSinReservaOnline: Story = {
  args: { kind: 'no-online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ver el complejo' })).toHaveAttribute(
      'href',
      '/complejo-fenix',
    )
  },
}

export const FaltanDatosDelTurno: Story = {
  args: { kind: 'missing' },
}

const TURNO = '/complejo-fenix?date=2026-03-14&hora=21%3A00&formato=5'

export const TurnoNoEncontrado: Story = {
  args: { kind: 'not-found', turnHref: TURNO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Elegir otro turno' })).toHaveAttribute(
      'href',
      TURNO,
    )
  },
}

export const TurnoYaNoDisponible: Story = {
  args: { kind: 'taken', turnHref: TURNO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Ese turno ya no está disponible' }),
    ).toBeVisible()
    // A la ficha con el día, la hora y el formato que eligió, no a la ficha pelada.
    await expect(canvas.getByRole('link', { name: 'Elegir otro turno' })).toHaveAttribute(
      'href',
      TURNO,
    )
  },
}
