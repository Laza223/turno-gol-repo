import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'
import { uid } from '@/test/fixtures/ids'
import { BookingErrorCard, BookingErrorNotFound } from './BookingErrorCard'

/**
 * `retryAction` entra por prop: `.../reservar/actions` es `'use server'` y
 * arrastra `node:async_hooks` si se importa como valor (ver el comentario en
 * el componente). El resultado siempre vive dentro de `<ReservaDarkShell>`.
 */
const meta = {
  title: 'Player/BookingResult/BookingErrorCard',
  component: BookingErrorCard,
  parameters: { layout: 'fullscreen' },
  args: { bookingId: uid(1002), retryAction: fn(async () => undefined) },
  decorators: [(Story) => <ReservaDarkShell><Story /></ReservaDarkShell>],
} satisfies Meta<typeof BookingErrorCard>

export default meta
type Story = StoryObj<typeof meta>

/** Dentro de la ventana del hold (DEFAULT_EXPIRY_SECONDS): ofrece reintentar el mismo booking. */
export const DentroDeVentana: Story = {
  args: { tenantSlug: 'complejo-fenix', withinWindow: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Reintentar pago' })).toBeInTheDocument()
  },
}

/** El hold ya expiró: el worker liberó el slot, hay que reservar de nuevo. */
export const FueraDeVentana: Story = {
  args: { tenantSlug: 'complejo-fenix', withinWindow: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Reservar de nuevo' })).toHaveAttribute(
      'href',
      '/complejo-fenix',
    )
  },
}

/** Sin tenantSlug (edge case defensivo): el link de "reservar de nuevo" cae al home. */
export const FueraDeVentanaSinSlug: Story = {
  args: { tenantSlug: null, withinWindow: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Reservar de nuevo' })).toHaveAttribute('href', '/')
  },
}

/** Reserva inexistente/purgada/ajena: estado neutro, no afirma que el pago falló. */
export const SinReserva: StoryObj<typeof BookingErrorNotFound> = {
  render: () => <BookingErrorNotFound />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No encontramos tu reserva.')).toBeInTheDocument()
  },
}
