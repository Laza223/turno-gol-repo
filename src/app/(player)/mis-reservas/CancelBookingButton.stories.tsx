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
    cancellationOutcome: 'refund',
    depositAmountCents: 150_000,
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

/**
 * El texto del preview de seña (`depositPreviewText`) no vive en un nodo
 * propio: es el último hijo-texto directo del `description` de ConfirmDialog,
 * después de `<strong>`s y dos `<br/>`. `getByText` con un string exacto
 * concatena TODO el texto directo del contenedor (`getNodeText`, ignora los
 * `<strong>`/`<br/>` pero no el resto de los textos hermanos), así que nunca
 * matchea el string aislado — de ahí el matcher por función (RTL normaliza
 * `content` con la misma regla `\s+` que colapsa el NBSP de `formatArs` a
 * espacio simple, así que tampoco hace falta lidiar con eso a mano).
 */
const hasText = (target: string) => (content: string) => content.includes(target)

export const Abierto: Story = {
  args: { action: fn(async () => ({ success: true as const, booking: {} as never })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(await screen.findByText('¿Cancelar esta reserva?')).toBeInTheDocument()
    await expect(screen.getByLabelText(/motivo \(opcional\)/i)).toBeInTheDocument()
    // ENS-2: la consecuencia concreta de cancelar AHORA (no más "en el plazo/fuera del plazo" en abstracto).
    await expect(screen.getByText(hasText('Se te devuelve la seña de $ 1.500.'))).toBeInTheDocument()
  },
}

/** ENS-2: sin seña paga, el modal avisa que no hay nada que devolver. */
export const AbiertoSinSeña: Story = {
  args: {
    action: fn(async () => ({ success: true as const, booking: {} as never })),
    cancellationOutcome: 'no_deposit',
    depositAmountCents: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(await screen.findByText(hasText('No hay seña que devolver.'))).toBeInTheDocument()
  },
}

/** ENS-2: fuera de la ventana de reembolso, el jugador pierde la seña. */
export const AbiertoFueraDePlazo: Story = {
  args: {
    action: fn(async () => ({ success: true as const, booking: {} as never })),
    cancellationOutcome: 'no_refund',
    depositAmountCents: 150_000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(await screen.findByText(hasText('Perdés la seña de $ 1.500.'))).toBeInTheDocument()
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
