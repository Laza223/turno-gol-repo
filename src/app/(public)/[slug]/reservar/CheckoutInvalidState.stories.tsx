import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CheckoutInvalidState } from './CheckoutStates'

/**
 * Reemplaza toda la página del checkout cuando algo no es válido (slug sin
 * reservas online, query params faltantes, turno inexistente o ya no libre).
 * Ya se envuelve a sí mismo en `<ReservaDarkShell>` — sin decorator extra.
 */
const meta = {
  title: 'Player/Checkout/CheckoutInvalidState',
  component: CheckoutInvalidState,
  parameters: { layout: 'fullscreen' },
  args: { slug: 'complejo-fenix' },
} satisfies Meta<typeof CheckoutInvalidState>

export default meta
type Story = StoryObj<typeof meta>

export const ComplejoSinReservaOnline: Story = {
  args: { message: 'Este complejo no acepta reservas online por el momento.' },
}

export const FaltanDatosDelTurno: Story = {
  args: { message: 'Faltan datos del turno. Elegí un horario desde la grilla.' },
}

export const TurnoNoEncontrado: Story = {
  args: { message: 'No encontramos ese turno. Puede que haya cambiado la disponibilidad.' },
}

export const TurnoYaNoDisponible: Story = {
  args: { message: 'Ese turno ya no está disponible. Elegí otro horario.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Ese turno ya no está disponible. Elegí otro horario.'),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Elegir otro turno' })).toHaveAttribute(
      'href',
      '/complejo-fenix',
    )
  },
}
