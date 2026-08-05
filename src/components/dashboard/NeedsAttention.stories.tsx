import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { NeedsAttention } from './NeedsAttention'
import type { AttentionItem } from '@/modules/home/home.types'

const meta = {
  title: 'Admin/Dashboard/NeedsAttention',
  component: NeedsAttention,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NeedsAttention>

export default meta
type Story = StoryObj<typeof meta>

const items: AttentionItem[] = [
  {
    kind: 'unpaid_completed_booking',
    bookingId: 'b1',
    pendingCents: 1600000,
    since: new Date('2026-08-02T21:00:00Z'),
    courtName: 'Cancha 1',
    timeLabel: '20:00-21:00',
    contactName: 'Tomás García',
  },
  {
    kind: 'failed_deposit',
    paymentId: 'p1',
    bookingId: 'b2',
    amountCents: 500000,
    since: new Date('2026-08-02T19:00:00Z'),
    courtName: 'Cancha 2',
    contactName: 'Ana López',
  },
  {
    kind: 'yesterday_cash_unclosed',
    date: '2026-08-01',
    since: new Date('2026-08-01T00:00:00Z'),
  },
]

export const ConAlertas: Story = {
  args: { items },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Necesita tu atención')).toBeVisible()
    // `formatArs` (Intl.NumberFormat) mete un NBSP (U+00A0) entre "$" y el
    // número. La computación del accessible name de `getByRole` NO lo
    // normaliza a espacio simple (a diferencia del normalizer default de
    // `getByText`), así que un literal con espacio ASCII nunca matchea acá:
    // el regex con `\s` cubre los dos (NBSP es whitespace válido para `\s`
    // en JS).
    await expect(canvas.getByRole('link', { name: /^Cobrar \$\s16\.000$/ })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ver reserva' })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Cerrar caja de ayer' })).toBeVisible()
  },
}

/** El vacío es el premio (contrato §4.1): copy exacto, sin parafrasear. */
export const Vacio: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nada pendiente. Todo cobrado y cerrado.')).toBeVisible()
  },
}
