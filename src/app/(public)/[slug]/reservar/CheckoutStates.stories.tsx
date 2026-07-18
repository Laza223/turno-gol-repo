import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'
import { CheckoutErrorBanner } from './CheckoutStates'

/**
 * `CheckoutErrorBanner` vive dentro del `<div className="mx-auto max-w-md ...">`
 * de `reservar/page.tsx`, arriba de `BookingSummary`, siempre dentro del shell oscuro.
 */
const meta = {
  title: 'Player/Checkout/CheckoutErrorBanner',
  component: CheckoutErrorBanner,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ReservaDarkShell>
        <div className="mx-auto max-w-md space-y-4 px-4 py-10">
          <Story />
        </div>
      </ReservaDarkShell>
    ),
  ],
} satisfies Meta<typeof CheckoutErrorBanner>

export default meta
type Story = StoryObj<typeof meta>

/** Sin error en la URL: no renderiza nada. */
export const SinError: Story = {
  args: { error: undefined },
}

export const TurnoTomado: Story = {
  args: { error: 'slot_taken' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/acaba de ser tomado/i)
  },
}

/** Softban activo con fecha de fin (2da ausencia en 90 días → 14 días bloqueado). */
export const BaneadoConFecha: Story = {
  args: { error: 'banned', until: '2026-03-28T00:00:00.000Z' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/volvés a poder reservar el/i)
  },
}

/** Ban sin fecha de fin explícita (edge case defensivo del banner). */
export const BaneadoSinFecha: Story = {
  args: { error: 'banned', until: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('No podés reservar en este complejo actualmente.')
  },
}

/** ENS-10: motivo real del softban (applyNoShowStrike), no "por ausencias" hardcodeado. */
export const BaneadoConMotivo: Story = {
  args: {
    error: 'banned',
    reason: 'Ausencias reiteradas (2+ en 90 días)',
    until: '2026-03-28T00:00:00.000Z',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('Ausencias reiteradas (2+ en 90 días)')
    await expect(canvas.getByRole('alert')).toHaveTextContent(/volvés a poder reservar el/i)
  },
}

/** Ban manual del complejo con un motivo arbitrario — el banner ya no asume "ausencias". */
export const BaneadoConMotivoManual: Story = {
  args: { error: 'banned', reason: 'Conducta indebida en la cancha', until: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'El complejo restringió tu cuenta: Conducta indebida en la cancha.',
    )
  },
}

export const DemasiadosHolds: Story = {
  args: { error: 'too_many_holds' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/reservas pendientes de pago/i)
  },
}

export const RateLimited: Story = {
  args: { error: 'rate_limited' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/yendo muy rápido/i)
  },
}

export const NoDisponible: Story = {
  args: { error: 'unavailable' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/no está disponible o no tiene precio/i)
  },
}
