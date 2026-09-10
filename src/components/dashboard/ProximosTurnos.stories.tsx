import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ProximosTurnos } from './ProximosTurnos'
import type { UpcomingCourt } from '@/modules/home/home.types'

const meta = {
  title: 'Admin/Dashboard/ProximosTurnos',
  component: ProximosTurnos,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProximosTurnos>

export default meta
type Story = StoryObj<typeof meta>

const courts: UpcomingCourt[] = [
  {
    courtId: 'c1',
    courtName: 'Cancha 1',
    turns: [
      {
        bookingId: 'b1',
        timeLabel: '20:00-21:00',
        relativeLabel: 'ahora',
        contactName: 'Tomás García',
        status: 'confirmed',
        type: 'spontaneous',
        depositStatus: 'paid',
      },
      {
        bookingId: 'b2',
        timeLabel: '21:00-22:00',
        relativeLabel: 'en 40 min',
        contactName: 'Rodrigo Paz',
        status: 'pending_payment',
        type: 'spontaneous',
        depositStatus: 'pending',
      },
    ],
  },
  {
    courtId: 'c2',
    courtName: 'Cancha 2',
    turns: [
      {
        bookingId: 'b3',
        timeLabel: '22:00-23:00',
        relativeLabel: null,
        contactName: 'Los de siempre',
        status: 'confirmed',
        type: 'fixed',
        depositStatus: 'pending',
      },
    ],
  },
  // Una cancha sin nada por delante es un dato, no un hueco: es el horario que
  // el dueño puede ofrecer por teléfono ahora mismo.
  { courtId: 'c3', courtName: 'Cancha 3', turns: [] },
]

const occupancy = { occupied: 9, available: 30, blocked: 2, pct: 30 }

export const ConTurnos: Story = {
  args: { courts, occupancy, dayIsClosed: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Próximos turnos')).toBeVisible()
    // La ocupación vive en el encabezado, no en una tarjeta suelta.
    await expect(canvas.getByText(/9 de 30 · 30% de ocupación · 2 bloqueados/)).toBeVisible()
    await expect(canvas.getByText('Libre el resto del día.')).toBeVisible()
    // El vocabulario de estado sale de slot-visual: "Esperando seña", no otro
    // nombre inventado para esta pantalla (H018/H101).
    await expect(canvas.getByText('Esperando seña')).toBeVisible()
    await expect(canvas.getByText('Abonado')).toBeVisible()
    await expect(canvas.getAllByRole('link')).toHaveLength(3)
  },
}

export const SinTurnosPorJugar: Story = {
  args: {
    courts: [{ courtId: 'c1', courtName: 'Cancha 1', turns: [] }],
    occupancy: { occupied: 12, available: 12, blocked: 0, pct: 100 },
    dayIsClosed: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No queda nada por jugar hoy.')).toBeVisible()
  },
}

export const DiaCerrado: Story = {
  args: {
    courts: [],
    occupancy: { occupied: 0, available: 0, blocked: 0, pct: 0 },
    dayIsClosed: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Hoy el complejo está cerrado.')).toBeVisible()
    await expect(canvas.getByText('Sin horarios para hoy')).toBeVisible()
  },
}

export const TodasLasCanchasPausadas: Story = {
  args: {
    courts: [],
    occupancy: { occupied: 0, available: 0, blocked: 0, pct: 0 },
    dayIsClosed: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No hay ninguna cancha en servicio.')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ir a Canchas' })).toBeVisible()
  },
}
