import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { buildBookingsIndex, computeCells, type GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'
import { GridDayList } from './GridDayList'

const SLOTS = ['18:00', '19:00', '20:00', '21:00', '22:00']

function court(id: string, name: string, status: 'online' | 'offline' = 'online'): CourtRow {
  return {
    id,
    tenantId: 'tenant-1',
    name,
    description: null,
    surfaceType: 'synthetic_grass',
    isCovered: false,
    hasLighting: true,
    format: 5,
    capacity: 10,
    photos: [],
    status,
    pricing: { rules: [{ days: ['mon'], from: '18:00', to: '23:00', price: 2400000 }] },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

const COURTS = [court('c1', 'Cancha 1'), court('c2', 'Cancha 2'), court('c3', 'Cancha 3')]

const BOOKINGS: GridBooking[] = [
  {
    id: 'b1',
    courtId: 'c1',
    date: '2026-06-15',
    timeStart: '20:00',
    timeEnd: '21:00',
    status: 'confirmed',
    type: 'spontaneous',
    guestName: 'Martina Sosa',
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 2400000,
    depositStatus: 'paid',
    depositAmount: 720000,
  },
  {
    id: 'b2',
    courtId: 'c2',
    date: '2026-06-15',
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'completed',
    type: 'spontaneous',
    guestName: 'Diego Ruiz',
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 2400000,
    // Terminó y falta plata: la única alarma de la grilla (MASTER §2.6).
    totalPaid: 0,
    pending: 2400000,
  },
  {
    id: 'b3',
    courtId: 'c3',
    date: '2026-06-15',
    timeStart: '19:00',
    timeEnd: '20:00',
    status: 'confirmed',
    type: 'fixed',
    guestName: 'Los Pibes',
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 2400000,
  },
]

const cells = computeCells(SLOTS, COURTS, buildBookingsIndex(BOOKINGS))

/**
 * La grilla como se ve en el teléfono (Fase 4). En la app la elige
 * `useIsDesktop` dentro de `BookingGrid`; acá se renderiza directo para poder
 * mirarla en cualquier viewport del canvas.
 */
const meta = {
  title: 'Admin/Grilla/GridDayList',
  component: GridDayList,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile-primary' },
  },
  decorators: [
    (Story) => (
      <div style={{ height: 560 }} className="flex flex-col p-3">
        <Story />
      </div>
    ),
  ],
  args: {
    courts: COURTS,
    slots: SLOTS,
    visibleSlots: SLOTS,
    cells,
    collapsedCount: 0,
    hasBand: false,
    isSlotPast: () => false,
    pulseIds: new Set<string>(),
    onDetailChange: fn(),
    onSlotClick: fn(),
    onExpandMorning: fn(),
    isNavPending: false,
  },
} satisfies Meta<typeof GridDayList>

export default meta
type Story = StoryObj<typeof meta>

/** Página "Todas": la que responde "¿tenés cancha a las 21?" de un vistazo. */
export const TodasLasCanchas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const todas = canvas.getByRole('region', { name: 'Todas las canchas' })
    await expect(within(todas).getByText('21:00–22:00')).toBeInTheDocument()
    await expect(
      within(todas).getByRole('button', { name: 'Reservar 18:00 en Cancha 1' }),
    ).toBeInTheDocument()
  },
}

/** Una cancha, hora por hora — con nombre y estado de plata en cada fila. */
export const UnaCancha: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancha 1' }))
    const page = canvas.getByRole('region', { name: 'Cancha 1' })
    await expect(
      within(page).getByRole('button', {
        name: 'Turno de 20:00 a 21:00 en Cancha 1, Martina Sosa',
      }),
    ).toBeInTheDocument()
  },
}

/** El turno terminado sin cobrar: la única alarma visual de la grilla. */
export const TurnoSinCobrar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const todas = canvas.getByRole('region', { name: 'Todas las canchas' })
    await expect(
      within(todas).getByRole('button', { name: 'Cancha 2 a las 21:00: Sin cobrar' }),
    ).toBeInTheDocument()
  },
}

/** Cancha pausada: se ve, pero no se puede reservar. */
export const CanchaPausada: Story = {
  args: { courts: [court('c1', 'Cancha 1', 'offline')] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const todas = canvas.getByRole('region', { name: 'Todas las canchas' })
    await expect(
      within(todas).getByRole('button', { name: 'Reservar 18:00 en Cancha 1' }),
    ).toBeDisabled()
  },
}

/** Un solo complejo con una cancha: sin carrusel que navegar. */
export const UnaSolaCancha: Story = {
  args: { courts: [court('c1', 'Única')] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const selector = canvas.getByRole('group', { name: 'Elegir cancha' })
    await expect(within(selector).getAllByRole('button')).toHaveLength(2)
  },
}
