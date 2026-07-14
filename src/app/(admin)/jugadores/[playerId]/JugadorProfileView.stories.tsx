import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { BanCheckResult } from '@/modules/bans/ban.service'
import { uid } from '@/test/fixtures/ids'
import { daysFromNow } from '@/test/fixtures/clock'
import type { PlayerProfile, PlayerStats, PlayerBookingRow } from '../queries'
import { JugadorProfileView } from './JugadorProfileView'

/**
 * `PlayerProfile`/`PlayerStats`/`PlayerBookingRow` vienen de `../queries.ts`
 * (route-local, sin *.types.ts propio) y `BanCheckResult` de
 * `@/modules/bans/ban.service` — ambos con `import type`, se borran al
 * compilar. Mismo patrón que reservas/[id]/BookingDetailCard.stories.tsx.
 */
const profile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  playerId: uid(231),
  name: 'Tomás Ibáñez',
  email: 'tomas.ibanez@example.com',
  phone: '+54 9 11 3344-5566',
  status: 'active',
  firstSeenAt: '2025-06-01T00:00:00.000Z',
  lastBookingAt: '2026-03-10T19:00:00.000Z',
  ...overrides,
})

const stats = (overrides: Partial<PlayerStats> = {}): PlayerStats => ({
  total: 14,
  completed: 12,
  noShow: 2,
  canceled: 1,
  noShowRate: 14,
  ...overrides,
})

const bookingRow = (overrides: Partial<PlayerBookingRow> = {}): PlayerBookingRow => ({
  id: uid(1901),
  date: '2026-03-10',
  timeStart: '18:00:00',
  timeEnd: '19:00:00',
  status: 'completed',
  type: 'spontaneous',
  priceSnapshot: 1_500_000, // $15.000
  courtName: 'Cancha 1',
  ...overrides,
})

const HISTORY: PlayerBookingRow[] = [
  bookingRow(),
  bookingRow({ id: uid(1902), date: '2026-03-03', status: 'no_show', courtName: 'Cancha 2', priceSnapshot: 1_600_000 }),
  bookingRow({
    id: uid(1903),
    date: '2026-02-24',
    status: 'canceled_refunded',
    type: 'fixed',
    priceSnapshot: 450_000,
  }),
]

const NOT_BANNED: BanCheckResult = { banned: false }

/** Softban por reincidencia de no-show (2da ausencia en 90 días → 14 días bloqueado, tenant_player_bans). */
const SOFTBAN: BanCheckResult = {
  banned: true,
  bannedGlobal: false,
  reason: 'Ausencias reiteradas (2+ en 90 días)',
  until: daysFromNow(9),
}

/**
 * Ficha de jugador (admin+manager). `content-area-gradient` reproduce el
 * fondo real del `<main>` del shell admin — mismo patrón que StaffRosterView
 * y JugadoresView.
 */
const meta = {
  title: 'Admin/Jugadores/JugadorProfileView',
  component: JugadorProfileView,
  parameters: { layout: 'fullscreen' },
  args: {
    profile: profile(),
    stats: stats(),
    history: HISTORY,
    ban: NOT_BANNED,
  },
  decorators: [
    (Story) => (
      <div className="content-area-gradient min-h-screen w-full px-4 py-8 sm:px-6 lg:px-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof JugadorProfileView>

export default meta
type Story = StoryObj<typeof meta>

/** Jugador normal: sin bloqueo, con historial, stats parejas. */
export const JugadorNormal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Tomás Ibáñez' })).toBeInTheDocument()
    await expect(canvas.getByText('14', { exact: true })).toBeInTheDocument() // Reservas totales
    await expect(canvas.queryByText('Bloqueado para reservar online')).not.toBeInTheDocument()
  },
}

/** Softban activo: el indicador de bloqueo tiene que verse, con motivo y fecha de fin. */
export const ConSoftbanActivo: Story = {
  args: { ban: SOFTBAN },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Bloqueado para reservar online')).toBeInTheDocument()
    await expect(canvas.getByText(/ausencias reiteradas \(2\+ en 90 días\)/i)).toBeInTheDocument()
    await expect(canvas.getByText(/hasta el/i)).toBeInTheDocument()
  },
}

/** Sin reservas registradas: el jugador se vinculó pero todavía no jugó (o recién se linkeó a un abonado). */
export const SinHistorial: Story = {
  args: { history: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin reservas registradas.')).toBeInTheDocument()
  },
}

/** Jugador recién vinculado: 0 reservas en todos los contadores, 0% de ausencia (no división por cero). */
export const StatsEnCero: Story = {
  args: {
    stats: stats({ total: 0, completed: 0, noShow: 0, canceled: 0, noShowRate: 0 }),
    history: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0%')).toBeInTheDocument() // Tasa de ausencia
    // Reservas totales, Completadas, Ausencias: las 3 quedan en "0".
    await expect(canvas.getAllByText('0', { exact: true })).toHaveLength(3)
  },
}
