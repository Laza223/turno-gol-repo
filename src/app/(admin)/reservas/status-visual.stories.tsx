import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { reservaStatusVisual, ReservaStatusBadge, RESERVA_UNPAID_VISUAL } from './status-visual'

/**
 * Vocabulario canónico de estado de una reserva (§8.5 MASTER): ícono + texto
 * + color, nunca color solo. `reservaStatusVisual` resuelve el mapeo real
 * desde `{ status, type }` — las stories pasan por ahí en vez de fabricar el
 * objeto `visual` a mano, para no divergir del componente real.
 *
 * El contenedor reproduce el uso real: el badge siempre vive dentro de una
 * superficie `bg-card` (fila de BookingListItem) o `.card-premium`
 * (BookingDetailCard), nunca suelto. Bug encontrado acá y arreglado en el
 * COMPONENTE (no era cosa del contenedor): la recipe neutral usaba `bg-muted
 * text-muted-foreground` — una combo OPACA que da 4.21:1 sin importar el
 * fondo detrás — en vez del patrón tinte/10 + texto-800 + ring que usan las
 * demás entradas. Mismo bug preexistente en abonados/status-visual.tsx
 * `canceled` (fuera de este paquete, no tocado acá).
 */
const meta = {
  title: 'Admin/Reservas/ReservaStatusBadge',
  component: ReservaStatusBadge,
  parameters: { layout: 'centered' },
  args: { visual: reservaStatusVisual({ status: 'confirmed', type: 'spontaneous' }) },
  decorators: [
    (Story) => (
      <div className="rounded-lg border border-border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReservaStatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const PendingPayment: Story = {
  args: { visual: reservaStatusVisual({ status: 'pending_payment', type: 'spontaneous' }) },
}
export const Confirmed: Story = {
  args: { visual: reservaStatusVisual({ status: 'confirmed', type: 'spontaneous' }) },
}
export const Completed: Story = {
  args: { visual: reservaStatusVisual({ status: 'completed', type: 'spontaneous' }) },
}
export const NoShow: Story = {
  args: { visual: reservaStatusVisual({ status: 'no_show', type: 'spontaneous' }) },
}
export const CanceledRefunded: Story = {
  args: { visual: reservaStatusVisual({ status: 'canceled_refunded', type: 'spontaneous' }) },
}
export const CanceledNoRefund: Story = {
  args: { visual: reservaStatusVisual({ status: 'canceled_no_refund', type: 'spontaneous' }) },
}
export const Expired: Story = {
  args: { visual: reservaStatusVisual({ status: 'expired', type: 'spontaneous' }) },
}
/** Bloqueo administrativo: el `type` gana por sobre cualquier `status`. */
export const Bloqueo: Story = {
  args: { visual: reservaStatusVisual({ status: 'confirmed', type: 'block' }) },
}

/**
 * La alarma de plata NO reemplaza al badge de estado: el turno sigue diciendo
 * "Jugada" y la píldora "Sin cobrar" va al lado. En la grilla sí reemplaza,
 * porque una celda tiene lugar para una sola palabra; acá el trabajo de la
 * columna es decir el estado del turno, y perderlo sería peor que el problema
 * que la alarma vino a resolver.
 */
export const JugadaSinCobrar: Story = {
  render: () => {
    const visual = reservaStatusVisual({
      status: 'completed',
      type: 'spontaneous',
      pending: 1_000_000,
      totalPaid: 0,
    })
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <ReservaStatusBadge visual={visual} />
        {visual.unpaid && <ReservaStatusBadge visual={RESERVA_UNPAID_VISUAL} />}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Jugada')).toBeVisible()
    await expect(canvas.getByText('Sin cobrar')).toBeVisible()
  },
}

/** Ausente sin un peso cobrado. Con la seña capturada NO habría píldora. */
export const AusenteSinCobrar: Story = {
  render: () => {
    const visual = reservaStatusVisual({
      status: 'no_show',
      type: 'spontaneous',
      totalPaid: 0,
    })
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <ReservaStatusBadge visual={visual} />
        {visual.unpaid && <ReservaStatusBadge visual={RESERVA_UNPAID_VISUAL} />}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ausente')).toBeVisible()
    await expect(canvas.getByText('Sin cobrar')).toBeVisible()
  },
}

/** La seña capturada es lo único cobrable de un no-show: ya está cobrado. */
export const AusenteConSenaCapturada: Story = {
  render: () => {
    const visual = reservaStatusVisual({
      status: 'no_show',
      type: 'spontaneous',
      totalPaid: 450_000,
    })
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <ReservaStatusBadge visual={visual} />
        {visual.unpaid && <ReservaStatusBadge visual={RESERVA_UNPAID_VISUAL} />}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ausente')).toBeVisible()
    await expect(canvas.queryByText('Sin cobrar')).toBeNull()
  },
}

export const Todos: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ReservaStatusBadge visual={reservaStatusVisual({ status: 'pending_payment', type: 'spontaneous' })} />
      <ReservaStatusBadge visual={reservaStatusVisual({ status: 'confirmed', type: 'spontaneous' })} />
      <ReservaStatusBadge visual={reservaStatusVisual({ status: 'completed', type: 'spontaneous' })} />
      <ReservaStatusBadge visual={reservaStatusVisual({ status: 'no_show', type: 'spontaneous' })} />
      <ReservaStatusBadge visual={reservaStatusVisual({ status: 'canceled_refunded', type: 'spontaneous' })} />
      <ReservaStatusBadge visual={reservaStatusVisual({ status: 'canceled_no_refund', type: 'spontaneous' })} />
      <ReservaStatusBadge visual={reservaStatusVisual({ status: 'expired', type: 'spontaneous' })} />
      <ReservaStatusBadge visual={reservaStatusVisual({ status: 'confirmed', type: 'block' })} />
    </div>
  ),
}
