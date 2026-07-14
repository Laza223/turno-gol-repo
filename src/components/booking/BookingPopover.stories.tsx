import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { booking, bookingBlock, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'
import { BookingPopover } from './BookingPopover'

/**
 * Contenido puro del popover de detalle de BookingCard — el portal/posicionamiento
 * vive en ui/popover.tsx (Radix). Se reproduce el panel real
 * (`PopoverContent` con `w-60 p-3`, superficie `bg-popover`) como decorator:
 * fuera de él el texto queda sobre `bg-background` y no representa el contraste real.
 */
const meta = {
  title: 'Booking/Grid/BookingPopover',
  component: BookingPopover,
  parameters: { layout: 'centered' },
  args: {
    courtName: 'Cancha 1',
    booking: toGridBooking(booking(), player()),
  },
  decorators: [
    (Story) => (
      <div className="w-60 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BookingPopover>

export default meta
type Story = StoryObj<typeof meta>

/** paymentMethod=mercadopago, depositStatus=paid (el fixture default). */
export const Default: Story = {}

export const PagoEfectivoSenaPendiente: Story = {
  args: {
    booking: toGridBooking(
      booking({ paymentMethod: 'cash', depositStatus: 'pending', depositAmount: 300000 }),
      player(),
    ),
  },
}

export const SenaReembolsada: Story = {
  args: {
    booking: toGridBooking(booking({ depositStatus: 'refunded' }), player()),
  },
}

export const SenaCobrada: Story = {
  args: {
    booking: toGridBooking(booking({ depositStatus: 'captured' }), player()),
  },
}

/** Bloqueo: solo nombre + horario, sin dl de precio/pago/seña. */
export const Bloqueo: Story = {
  args: { booking: toGridBooking(bookingBlock()) },
}

/** guestName y playerFirstName ausentes → "Sin nombre". */
export const SinNombre: Story = {
  args: {
    // playerRow=null: aunque el booking tenga playerId, se omite el join
    // (mismo resultado que un guest sin nombre cargado).
    booking: toGridBooking(booking({ guestName: null }), null),
  },
}
