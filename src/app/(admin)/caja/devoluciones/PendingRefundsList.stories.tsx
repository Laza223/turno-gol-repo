import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import type { PendingRefundRow } from '@/modules/payments/refund.service'
import { PendingRefundsList } from './PendingRefundsList'

/**
 * Lo que el complejo DEBE, al lado de "Plata en la calle", que es lo que le
 * deben. Se ven parecido y están a un tab de distancia, así que el encabezado
 * dice explícitamente "Tenés que devolver": confundir los dos totales sería
 * caro.
 */
const meta = {
  title: 'Caja/Devoluciones/PendingRefundsList',
  component: PendingRefundsList,
  parameters: { layout: 'padded' },
  args: { action: fn(async () => ({ success: true as const })) },
} satisfies Meta<typeof PendingRefundsList>

export default meta
type Story = StoryObj<typeof meta>

function row(overrides: Partial<PendingRefundRow> = {}): PendingRefundRow {
  return {
    refundPaymentId: '11111111-1111-4111-8111-111111111111',
    bookingId: '22222222-2222-4222-8222-222222222222',
    amountCents: 500000,
    method: 'mercadopago',
    since: new Date('2026-08-18T20:00:00Z'),
    debtorName: 'Tomás García',
    contactPhone: '+54 9 11 5566-7788',
    contactEmail: 'tomas@jugador.test',
    courtName: 'Cancha 5',
    date: '2026-08-18',
    timeStart: '21:00:00',
    ...overrides,
  }
}

export const ConDevoluciones: Story = {
  args: {
    rows: [
      row(),
      row({
        refundPaymentId: '33333333-3333-4333-8333-333333333333',
        method: 'cash',
        amountCents: 300000,
        debtorName: 'Nicolás Pérez',
        since: new Date('2026-08-10T18:00:00Z'),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Tenés que devolver')).toBeInTheDocument()
    // El total es la suma de las dos filas: $8.000.
    await expect(canvas.getByText(/8\.000/)).toBeInTheDocument()
    // El origen se muestra porque decide si MercadoPago todavía puede
    // resolverla solo: la de efectivo depende enteramente del complejo.
    await expect(canvas.getByText('MercadoPago')).toBeInTheDocument()
    await expect(canvas.getByText('Efectivo')).toBeInTheDocument()
    await expect(canvas.getAllByRole('button', { name: 'Ya devolví' })).toHaveLength(2)
  },
}

/**
 * Sin teléfono no se ofrece WhatsApp: un link a un número que no existe hace
 * perder el tiempo dos veces. Cae al email, que es NOT NULL para cualquier
 * jugador con cuenta — medido en el navegador con un jugador real sin teléfono
 * cargado, la fila no ofrecía NINGÚN canal.
 */
export const SinTelefonoDelJugador: Story = {
  args: { rows: [row({ contactPhone: null, debtorName: 'Sin nombre' })] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: /avisarle por whatsapp/i })).toBeNull()
    await expect(canvas.getByRole('link', { name: /avisarle por email/i })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:tomas@jugador.test'),
    )
    await expect(canvas.getByRole('link', { name: /ver el turno/i })).toBeInTheDocument()
  },
}

/** Ni teléfono ni cuenta (turno de invitado): queda "Ver el turno" y nada más. */
export const SinNingunContacto: Story = {
  args: { rows: [row({ contactPhone: null, contactEmail: null, debtorName: 'Sin nombre' })] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: /avisarle/i })).toBeNull()
    await expect(canvas.getByRole('link', { name: /ver el turno/i })).toBeInTheDocument()
  },
}

/** El vacío es el premio, igual que en "Necesita tu atención". */
export const SinDevoluciones: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No debés ninguna devolución')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Ya devolví' })).toBeNull()
  },
}
