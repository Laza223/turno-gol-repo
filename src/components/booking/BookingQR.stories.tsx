import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import BookingQR from './BookingQR'

/**
 * SVG puro (uqr), sin estado — el mismo componente sirve en la tarjeta de la
 * página de éxito (rodeado de `bg-white p-3`, ver exito/page.tsx) y en el
 * comprobante imprimible (BookingReceipt).
 */
const meta = {
  title: 'Booking/Grid/BookingQR',
  component: BookingQR,
  parameters: { layout: 'centered' },
  args: {
    value: 'https://turnogol.app/reserva/b1a2c3d4-0001-4000-8000-000000000001/verificar',
    label: 'Código QR de verificación de la reserva',
  },
  decorators: [
    (Story) => (
      <div className="rounded-xl bg-white p-3 shadow-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BookingQR>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Tamaño del comprobante imprimible (132px en vez de los 176px default). */
export const TamanoComprobante: Story = {
  args: { size: 132 },
}

/** URL larga (slug + UUID largos): el QR sube de densidad pero sigue siendo escaneable. */
export const UrlLarga: Story = {
  args: {
    value:
      'https://turnogol.app/reserva/b1a2c3d4-0001-4000-8000-000000000001/verificar?utm_source=comprobante&utm_medium=print',
  },
}
