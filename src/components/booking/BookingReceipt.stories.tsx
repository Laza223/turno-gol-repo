import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { booking } from '@/test/fixtures/booking'
import { courtFutbol5 } from '@/test/fixtures/court'
import { tenant } from '@/test/fixtures/tenant'
import BookingReceipt from './BookingReceipt'

const b = booking()
const court = courtFutbol5()
const t = tenant()

/**
 * `#booking-receipt` vive oculto por defecto (`@media screen { display: none }`
 * en globals.css) y es lo ÚNICO visible al hacer `window.print()` — DownloadReceiptButton
 * es el único disparador real. Reproducir el "contenedor real" acá significaría
 * una story invisible, así que el decorator override esa única regla (con
 * `!important`, comentado) para poder ver/medir el comprobante sin imprimir de
 * verdad; el resto de `globals.css` (colores, `@media print`) queda intacto.
 */
const meta = {
  title: 'Booking/Grid/BookingReceipt',
  component: BookingReceipt,
  parameters: { layout: 'padded' },
  args: {
    bookingId: b.id,
    tenantName: t.name,
    address: t.address,
    city: t.city,
    courtName: court.name,
    date: '2026-03-14',
    timeStart: b.timeStart,
    timeEnd: b.timeEnd,
    priceSnapshot: b.priceSnapshot,
    depositAmount: b.depositAmount,
    depositStatus: b.depositStatus,
    verifyUrl: `https://turnogol.app/reserva/${b.id}/verificar`,
  },
  decorators: [
    (Story) => (
      <>
        <style>{'#booking-receipt { display: block !important; }'}</style>
        <div className="mx-auto max-w-sm">
          <Story />
        </div>
      </>
    ),
  ],
} satisfies Meta<typeof BookingReceipt>

export default meta
type Story = StoryObj<typeof meta>

/** Con seña: precio, seña pagada y resto a abonar en el complejo. */
export const ConSena: Story = {}

/** Sin seña: el complejo cobra el total al llegar (settings.requires_deposit=false). */
export const SinSena: Story = {
  args: { depositAmount: 0, depositStatus: 'not_required' },
}
