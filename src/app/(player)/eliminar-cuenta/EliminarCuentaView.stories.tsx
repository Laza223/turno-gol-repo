import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { EliminarCuentaView } from './EliminarCuentaView'

/** Reproduce `.player-shell-bg` (fondo del portal, ver ConfiguracionView.stories.tsx). */
const meta = {
  title: 'Player/EliminarCuenta/EliminarCuentaView',
  component: EliminarCuentaView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/eliminar-cuenta' } },
  },
  args: {
    confirmEmail: 'tomas.ibanez@example.com',
    action: fn(async () => ({ success: true as const })),
  },
  decorators: [
    (Story) => (
      <div className="player-shell-bg min-h-dvh py-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EliminarCuentaView>

export default meta
type Story = StoryObj<typeof meta>

/** Sin reservas futuras confirmadas: no aparece el aviso naranja. */
export const SinReservasFuturas: Story = {
  args: { futureConfirmedCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/reservas confirmadas futuras/i)).not.toBeInTheDocument()
  },
}

/** 1 reserva confirmada futura: singular ("reserva confirmada"). */
export const UnaReservaFutura: Story = {
  args: { futureConfirmedCount: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/tenés 1 reserva confirmada futuras/i)).toBeInTheDocument()
  },
}

/** 3 reservas confirmadas futuras: plural. */
export const VariasReservasFuturas: Story = {
  args: { futureConfirmedCount: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/tenés 3 reservas confirmadas futuras/i)).toBeInTheDocument()
  },
}
