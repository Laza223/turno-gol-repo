import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import { CheckoutErrorBanner, RESERVAR_COLUMN } from './CheckoutStates'

/**
 * `CheckoutErrorBanner` vive en la columna de `reservar/page.tsx`, arriba de `BookingSummary`,
 * dentro del mundo del portal.
 */
const meta = {
  title: 'Player/Checkout/CheckoutErrorBanner',
  component: CheckoutErrorBanner,
  parameters: { layout: 'fullscreen' },
  // La ficha con lo que eligió (día, hora y formato): la misma salida que el "Volver".
  args: { turnHref: '/club-norte?date=2026-03-14&hora=21%3A00&formato=5' },

  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <div className={RESERVAR_COLUMN}>
            <Story />
          </div>
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof CheckoutErrorBanner>

export default meta
type Story = StoryObj<typeof meta>

/** Sin error en la URL: no renderiza nada. */
export const SinError: Story = {
  args: { error: undefined },
}

/** Softban activo con fecha de fin (2da ausencia en 90 días → 14 días bloqueado). */
export const BaneadoConFecha: Story = {
  args: { error: 'banned', until: '2026-03-28T00:00:00.000Z' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      /No podés reservar en este complejo hasta el/,
    )
    // Otro turno de este complejo daría el mismo error: la salida es otro complejo.
    await expect(canvas.getByRole('link', { name: 'Buscar otro complejo' })).toHaveAttribute(
      'href',
      '/explorar',
    )
  },
}

/** Ban sin fecha de fin ni motivo: el bloqueo es del complejo, no de TurnoGol. */
export const BaneadoSinFecha: Story = {
  args: { error: 'banned', until: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('No podés reservar en este complejo.')
    await expect(canvas.getByRole('alert')).not.toHaveTextContent('Motivo')
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
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Motivo: Ausencias reiteradas (2+ en 90 días).',
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      /No podés reservar en este complejo hasta el/,
    )
  },
}

/** Ban manual del complejo con un motivo arbitrario — el banner ya no asume "ausencias". */
export const BaneadoConMotivoManual: Story = {
  args: { error: 'banned', reason: 'Conducta indebida en la cancha', until: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'No podés reservar en este complejo. Motivo: Conducta indebida en la cancha.',
    )
  },
}

export const DemasiadosHolds: Story = {
  args: { error: 'too_many_holds' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/esperando el pago de la seña/i)
    await expect(canvas.getByRole('link', { name: 'Elegir otro turno' })).toHaveAttribute(
      'href',
      '/club-norte?date=2026-03-14&hora=21%3A00&formato=5',
    )
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
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'No pudimos reservar este turno. Probá con otro horario o con otra cancha.',
    )
  },
}

export const FueraDeFecha: Story = {
  args: { error: 'date_out_of_range' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/ya no se puede reservar/i)
  },
}
