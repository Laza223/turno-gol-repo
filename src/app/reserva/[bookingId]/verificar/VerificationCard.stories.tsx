import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import {
  VerificationCard,
  VerificationNotFound,
  type VerificationBooking,
} from './VerificationCard'

const booking: VerificationBooking = {
  tenantName: 'Complejo Fénix',
  city: 'Ciudad Autónoma de Buenos Aires',
  courtName: 'Cancha 1',
  date: '2026-03-14',
  timeStart: '18:00',
  timeEnd: '19:00',
}

/**
 * Página pública sin auth (el complejo la abre escaneando el QR del comprobante).
 * `page.tsx` renderiza `VerificationCard` (o `VerificationNotFound`) suelto,
 * sin más contenedor — no hace falta decorator adicional.
 */
const meta = {
  title: 'Player/BookingResult/VerificationCard',
  component: VerificationCard,
  parameters: { layout: 'padded' },
  args: { booking, bookingId: uid(1001) },
} satisfies Meta<typeof VerificationCard>

export default meta
type Story = StoryObj<typeof meta>

export const Confirmada: Story = {
  args: { status: 'confirmed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Reserva confirmada' })).toBeInTheDocument()
    await expect(canvas.getByText('El turno está vigente.')).toBeInTheDocument()
  },
}

export const Completada: Story = { args: { status: 'completed' } }

export const SenaPendiente: Story = {
  args: { status: 'pending_payment' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Seña pendiente de pago' }),
    ).toBeInTheDocument()
  },
}

export const CanceladaConReembolso: Story = { args: { status: 'canceled_refunded' } }
export const CanceladaSinReembolso: Story = { args: { status: 'canceled_no_refund' } }

export const Expirada: Story = { args: { status: 'expired' } }

export const Ausencia: Story = {
  args: { status: 'no_show' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Ausencia registrada' })).toBeInTheDocument()
  },
}

/** Status fuera del enum conocido — fallback defensivo, nunca debería pasar en prod. */
export const EstadoDesconocido: Story = { args: { status: 'algo_nuevo' } }

/** UUID inválido, reserva inexistente o tenant no visible públicamente (fail-closed genérico). */
export const NoEncontrada: Story = {
  args: { status: 'confirmed' },
  render: () => <VerificationNotFound />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: /no pudimos verificar/i })).toBeInTheDocument()
  },
}
