import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { RefundContactPanel } from './RefundContactPanel'

/**
 * El reembolso automático de MercadoPago falla siempre (403 — MP deriva los
 * permisos del producto de la aplicación y ninguno concede el de reembolsos),
 * así que la devolución la hace el complejo y el jugador necesita poder
 * escribirle. Antes de esto se le decía "contactá al complejo" sin dar un solo
 * canal.
 */
const meta = {
  title: 'Player/MisReservas/RefundContactPanel',
  component: RefundContactPanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RefundContactPanel>

export default meta
type Story = StoryObj<typeof meta>

const BASE = {
  amountCents: 500000,
  settledMethod: null,
  settledAt: null,
  bookingCode: 'A1B2C3D4',
  dateLabel: '25/08',
  timeLabel: '21:00',
  tenantName: 'Complejo Norte',
  tenantPhone: '+54 9 2323 346976',
  tenantEmail: 'contacto@complejo.test',
}

/** El caso real de hoy: la plata no se movió y la debe el complejo. */
export const Pendiente: Story = {
  args: { refund: { ...BASE, state: 'pending', tenantWhatsapp: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/te tiene que devolver/i)).toBeInTheDocument()
    await expect(canvas.getByText('A1B2C3D4')).toBeInTheDocument()
    // Sin WhatsApp propio cargado cae al teléfono, normalizado a formato
    // internacional. El host y los dígitos se assertean por separado porque
    // tests/unit/contact-whatsapp.test.ts prohíbe el literal completo en src/.
    const wa = canvas.getByRole('link', { name: /escribir por whatsapp/i })
    await expect(wa).toHaveAttribute('href', expect.stringContaining('https://wa.me/'))
    await expect(wa).toHaveAttribute('href', expect.stringContaining('5492323346976'))
    // El mensaje viene escrito, con el código para que el complejo lo busque.
    await expect(wa).toHaveAttribute('href', expect.stringContaining('A1B2C3D4'))
  },
}

/** Si MercadoPago llegara a procesarla, no se le pide nada al jugador. */
export const Saldada: Story = {
  args: {
    refund: {
      ...BASE,
      state: 'settled',
      settledMethod: 'mercadopago',
      settledAt: '2026-08-24T14:30:00Z',
      tenantWhatsapp: '+54 9 11 5566-7788',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/mercadopago ya procesó/i)).toBeInTheDocument()
    await expect(canvas.queryByText(/te tiene que devolver/i)).not.toBeInTheDocument()
    // Con WhatsApp propio cargado, gana sobre el teléfono: el 11 del celular
    // en vez del 2323 del fijo.
    await expect(canvas.getByRole('link', { name: /escribir por whatsapp/i })).toHaveAttribute(
      'href',
      expect.stringContaining('5491155667788'),
    )
  },
}

/**
 * Saldada FUERA de MercadoPago — el caso más común, porque el reembolso
 * automático nunca funciona y el complejo termina devolviendo por transferencia
 * o en mano.
 *
 * Existe por un bug medido en el navegador: la pantalla decía "MercadoPago ya
 * procesó la devolución" para cualquier devolución saldada, así que a alguien
 * que ya había cobrado por transferencia se lo mandaba a esperar en la app
 * equivocada. Ninguna story lo tomaba porque las dos que había nacieron
 * asumiendo que 'settled' solo podía venir de MercadoPago.
 */
export const SaldadaPorTransferencia: Story = {
  args: {
    refund: {
      ...BASE,
      state: 'settled',
      settledMethod: 'transfer',
      settledAt: '2026-08-24T14:30:00Z',
      tenantWhatsapp: '+54 9 11 5566-7788',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/por transferencia/i)).toBeInTheDocument()
    await expect(canvas.queryByText(/mercadopago/i)).not.toBeInTheDocument()
    // Sigue habiendo canal: "me dice que devolvió y no me llegó" es
    // exactamente el reclamo que hay que poder hacer.
    await expect(canvas.getByRole('link', { name: /escribir por whatsapp/i })).toBeInTheDocument()
  },
}

/** Lo mismo en efectivo: el medio se nombra, no se asume. */
export const SaldadaEnEfectivo: Story = {
  args: {
    refund: {
      ...BASE,
      state: 'settled',
      settledMethod: 'cash',
      settledAt: '2026-08-24T14:30:00Z',
      tenantWhatsapp: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/en efectivo/i)).toBeInTheDocument()
    await expect(canvas.queryByText(/mercadopago/i)).not.toBeInTheDocument()
  },
}

/**
 * Teléfono no marcable: se esconde el botón de WhatsApp en vez de ofrecer un
 * link roto. Queda el email, que es NOT NULL en la base — el jugador nunca se
 * queda sin canal.
 */
export const SinNumeroMarcable: Story = {
  args: {
    refund: { ...BASE, state: 'pending', tenantPhone: '1234', tenantWhatsapp: null },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: /escribir por whatsapp/i })).toBeNull()
    await expect(canvas.getByRole('link', { name: /email/i })).toHaveAttribute(
      'href',
      'mailto:contacto@complejo.test',
    )
  },
}
