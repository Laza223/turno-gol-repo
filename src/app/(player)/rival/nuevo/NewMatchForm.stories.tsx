import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { RivalFormResult } from '../actions'
import { expect, fn, userEvent, within } from 'storybook/test'
import { NewMatchForm } from './NewMatchForm'

// Reloj congelado de las stories: sábado 2026-03-14, 15:30 ART.
const TODAY = '2026-03-14'

const tenants = [
  { id: 't1', name: 'El Vagón', city: 'Luján' },
  { id: 't2', name: 'Open Door', city: 'Pilar' },
]

const meta = {
  title: 'Player/Rival/NewMatchForm',
  component: NewMatchForm,
  parameters: { layout: 'padded' },
  args: {
    tenants,
    bookings: [],
    prefill: null,
    today: TODAY,
    nowTime: '15:30',
    action: fn(async (): Promise<RivalFormResult> => ({ success: true })),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-lg bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NewMatchForm>

export default meta
type Story = StoryObj<typeof meta>

export const SinReserva: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El cupo arranca en formato x 2 y el tablón está apagado (publicar es del PR4).
    await expect(canvas.getByRole('status')).toHaveTextContent('10')
    await expect(canvas.getByText('Apagado (solo el grupo)')).toBeInTheDocument()
    await expect(canvas.queryByText(/WhatsApp/)).toBeNull()
    // Sin reserva, la cancha se declara con la casilla.
    await expect(canvas.getByRole('checkbox', { name: 'Ya tengo la cancha' })).not.toBeChecked()
    await userEvent.click(canvas.getByRole('button', { name: 'Uno más' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('11')
  },
}

export const ConReservaVinculada: Story = {
  args: {
    // Sábado 21:00 ART = 00:00 UTC del domingo.
    bookings: [{ tenantId: 't1', startsAt: '2026-03-15T00:00:00.000Z' }],
    prefill: { tenantId: 't1', date: '2026-03-14', time: '21:00', format: 7 },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Viene de tu reserva')).toBeInTheDocument()
    await expect(canvas.getByText('Reservada en TurnoGol')).toBeInTheDocument()
    await expect(canvas.queryByRole('checkbox')).toBeNull()
    // El formato de la reserva (Fútbol 7) fija el cupo en 14.
    await expect(canvas.getByRole('status')).toHaveTextContent('14')
  },
}

export const ErrorDeDominio: Story = {
  args: {
    action: fn(async (): Promise<RivalFormResult> => ({
      success: false,
      error: 'Ya tenés 3 partidos armados. Cancelá uno o esperá a que se juegue para armar otro.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Armar el partido' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ya tenés 3 partidos armados')
  },
}

export const ReservaBloqueadaConErrorDeFecha: Story = {
  args: {
    bookings: [{ tenantId: 't1', startsAt: '2026-03-15T00:00:00.000Z' }],
    prefill: { tenantId: 't1', date: '2026-03-14', time: '21:00', format: 7 },
    action: fn(async (): Promise<RivalFormResult> => ({
      success: false,
      error: 'Solo se puede armar hasta 7 días adelante.',
      field: 'startsAt',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Con la reserva fijada no hay campo donde pintar el error: tiene que salir arriba del botón.
    await userEvent.click(canvas.getByRole('button', { name: 'Armar el partido' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('hasta 7 días adelante')
  },
}
