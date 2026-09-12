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

/** Reloj FIJO y no `Date.now()`: "hace 5 min" es parte de lo que la story
 *  aserta, y con el reloj real el texto cambia en cada corrida. */
const NOW_MS = new Date('2026-08-02T21:05:00Z').getTime()

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
    kind: 'pending_refunds',
    count: 2,
    totalCents: 600000,
    since: new Date('2026-08-01T00:00:00Z'),
  },
]

export const ConAlertas: Story = {
  args: { items, nowMs: NOW_MS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Necesita tu atención')).toBeVisible()
    await expect(canvas.getByText('3 pendientes')).toBeVisible()
    // `formatArs` (Intl.NumberFormat) mete un NBSP (U+00A0) entre "$" y el
    // número. La computación del accessible name de `getByRole` NO lo
    // normaliza a espacio simple (a diferencia del normalizer default de
    // `getByText`), así que un literal con espacio ASCII nunca matchea acá:
    // el regex con `\s` cubre los dos (NBSP es whitespace válido para `\s`
    // en JS).
    await expect(canvas.getByRole('link', { name: /^Cobrar \$\s16\.000$/ })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ver reserva' })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ver devoluciones' })).toBeVisible()
    // `since` ya llegaba en los tres kinds y sólo servía para ordenar; el
    // rediseño lo pinta porque es lo que separa "recién pasó" de "se está
    // yendo hace seis horas".
    await expect(canvas.getByText('Jugada y sin cobrar · hace 5 min')).toBeVisible()
    await expect(canvas.getByText('Seña rechazada · hace 2 h')).toBeVisible()
    await expect(canvas.getByText('La más vieja, hace 1 día')).toBeVisible()
  },
}

/** Singular: el contador del encabezado y el copy de devoluciones cambian. */
export const UnaSolaAlerta: Story = {
  args: { items: [items[0]!], nowMs: NOW_MS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('1 pendiente')).toBeVisible()
  },
}

/**
 * El vacío es el premio (contrato §4.1): copy exacto, sin parafrasear. Desde
 * el rediseño del 2026-09-12 mide una línea de 44px en vez de una tarjeta de
 * 200px — es el estado en que el dueño encuentra la pantalla casi siempre, y
 * ocupando ese alto empujaba el tablero fuera de la primera pantalla.
 */
export const Vacio: Story = {
  args: { items: [], nowMs: NOW_MS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nada pendiente. Todo cobrado y cerrado.')).toBeVisible()
    await expect(canvas.queryByText('Necesita tu atención')).toBeNull()
  },
}
