import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'
import BookingSummary, { type BookingSummaryData } from './BookingSummary'

const base: BookingSummaryData = {
  tenantName: 'Complejo Fénix',
  city: 'Ciudad Autónoma de Buenos Aires',
  courtName: 'Cancha 1',
  date: '2026-03-14',
  timeStart: '18:00',
  timeEnd: '19:00',
  price: 1500000,
  depositAmount: 450000,
}

/** El checkout siempre vive dentro de `<ReservaShell>` (glow esmeralda, ver reservar/page.tsx). */
const meta = {
  title: 'Player/Checkout/BookingSummary',
  component: BookingSummary,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ReservaDarkShell>
        <div className="mx-auto max-w-md px-4 py-6">
          <Story />
        </div>
      </ReservaDarkShell>
    ),
  ],
} satisfies Meta<typeof BookingSummary>

export default meta
type Story = StoryObj<typeof meta>

/** Con seña: muestra el monto a pagar ahora + el resto que queda en el complejo. */
export const ConSena: Story = {
  args: { data: base },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Seña a pagar ahora')).toBeInTheDocument()
    // formatArs separa "$" del monto con NBSP (U+00A0); getByText normaliza el
    // textContent a espacio común (\s+ → ' ', y \s matchea NBSP) — el matcher
    // usa espacio común, no NBSP.
    await expect(canvas.getByText('$ 4.500')).toBeInTheDocument()
    await expect(canvas.getByText('Resto en el complejo')).toBeInTheDocument()
  },
}

/** Sin seña: el complejo cobra el total presencialmente. */
export const SinSena: Story = {
  args: { data: { ...base, depositAmount: 0 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Este complejo no requiere seña. Pagás el total en el complejo.'),
    ).toBeInTheDocument()
    await expect(canvas.queryByText('Seña a pagar ahora')).not.toBeInTheDocument()
  },
}
