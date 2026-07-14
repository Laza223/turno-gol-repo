import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { CancelBookingButton } from './CancelBookingButton'

/**
 * La Server Action entra por prop (ver el comentario en CancelBookingButton.tsx).
 * ConfirmDialog (Radix) monta en un portal fuera de canvasElement: las
 * assertions post-apertura usan `screen`.
 *
 * El decorator reproduce el `bg-card` (blanco) de la fila de reserva en
 * MisReservasView.tsx: el botón nunca vive suelto sobre `bg-background`
 * (slate ~#DDE3EC), y ahí `text-red-600` da 3.88:1 (falla AA) contra el
 * 4.83:1 que da sobre `bg-card`.
 */
const meta = {
  title: 'Player/MisReservas/CancelBookingButton',
  component: CancelBookingButton,
  parameters: {
    layout: 'centered',
    nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } },
  },
  args: {
    bookingId: 'booking-1',
    courtName: 'Cancha 1',
    dateLabel: 'sáb, 14 mar',
    timeLabel: '18:00–19:00',
  },
  decorators: [
    (Story) => (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CancelBookingButton>

export default meta
type Story = StoryObj<typeof meta>

export const Cerrado: Story = {
  args: { action: fn(async () => ({ success: true as const, booking: {} as never })) },
}

export const Abierto: Story = {
  args: { action: fn(async () => ({ success: true as const, booking: {} as never })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(await screen.findByText('¿Cancelar esta reserva?')).toBeInTheDocument()
    await expect(screen.getByLabelText(/motivo \(opcional\)/i)).toBeInTheDocument()
  },
}

export const ErrorAlCancelar: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'La reserva no está en estado confirmado.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }))
    await expect(await screen.findByRole('alert')).toHaveTextContent(
      'La reserva no está en estado confirmado.',
    )
  },
}

/** Éxito: router.refresh() re-obtiene la lista sin la reserva cancelada. */
export const CanceladoOk: Story = {
  args: { action: fn(async () => ({ success: true as const, booking: {} as never })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/motivo \(opcional\)/i), 'Se suspendió por lluvia')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }))
    await expect(getRouter().refresh).toHaveBeenCalled()
  },
}
