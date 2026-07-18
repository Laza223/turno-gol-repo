import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import type { PlayerListRow } from './queries'
import { JugadoresView } from './JugadoresView'

/**
 * `PlayerListRow` viene de `./queries.ts` (route-local, sin *.types.ts propio,
 * como `ReservaDetail` en reservas/[id]/BookingDetailCard.stories.tsx) —
 * `import type` se borra al compilar, no arrastra drizzle al bundle.
 */
const jugador = (overrides: Partial<PlayerListRow> = {}): PlayerListRow => ({
  playerId: uid(221),
  name: 'Tomás Ibáñez',
  email: 'tomas.ibanez@example.com',
  phone: '+54 9 11 3344-5566',
  bookingsCount: 12,
  noshowCount: 0,
  status: 'active',
  lastBookingAt: '2026-03-10T19:00:00.000Z',
  ...overrides,
})

const JUGADORES: PlayerListRow[] = [
  jugador(),
  jugador({
    playerId: uid(222),
    name: 'Julián Álvarez',
    email: 'julian.alvarez@example.com',
    phone: '+54 9 11 2233-4455',
    bookingsCount: 5,
    noshowCount: 2,
  }),
  jugador({
    playerId: uid(223),
    name: 'Juan Ignacio Rodríguez Etchegoyen',
    email: 'juan.ignacio.rodriguez.etchegoyen@example.com',
    phone: '+54 9 11 5566-7788',
    bookingsCount: 40,
    noshowCount: 1,
  }),
]

/**
 * Vista Jugadores (listado, admin+manager). `content-area-gradient` reproduce
 * el fondo real del `<main>` del shell admin (admin-layout-shell.tsx), donde
 * vive esta vista sin ningún wrapper propio — mismo patrón que StaffRosterView.
 */
const meta = {
  title: 'Admin/Jugadores/JugadoresView',
  component: JugadoresView,
  parameters: { layout: 'fullscreen' },
  args: { players: JUGADORES, q: undefined },
  decorators: [
    (Story) => (
      <div className="content-area-gradient min-h-screen w-full px-4 py-8 sm:px-6 lg:px-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof JugadoresView>

export default meta
type Story = StoryObj<typeof meta>

/** Listado con 3 jugadores: uno sin ausencias, uno con 2, uno con nombre largo. */
export const ConJugadores: Story = {
  play: async ({ canvasElement }) => {
    // ResponsiveList mantiene tabla Y cards montadas a la vez — CSS decide
    // cuál se ve, pero getByText no filtra por visibilidad. Acotamos a la
    // tabla (la visible en este viewport) para no chocar con la card duplicada.
    const table = within(within(canvasElement).getByRole('table'))
    await expect(table.getByText('Julián Álvarez')).toBeVisible()
    // Julián tiene noshowCount=2: el badge de ausencias.
    await expect(table.getByText('2', { selector: 'td span' })).toBeVisible()
  },
}

/** Complejo recién onboardeado: sin jugadores vinculados todavía (ningún guest). */
export const Vacio: Story = {
  args: { players: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Todavía no tenés jugadores vinculados'),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('link', { name: 'Compartí tu link desde el panel' }),
    ).toHaveAttribute('href', '/dashboard')
  },
}

/** `q` con resultados vacíos: el copy de empty state cambia respecto del listado sin filtro. */
export const BusquedaSinResultados: Story = {
  args: { players: [], q: 'nombre-inexistente' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('No se encontraron jugadores que coincidan con la búsqueda.'),
    ).toBeInTheDocument()
  },
}

/** 50 registros: la tabla no se rompe con volumen (LIMIT 200 real en listTenantPlayers). */
export const MuchosRegistros: Story = {
  args: {
    players: Array.from({ length: 50 }, (_, i) =>
      jugador({
        playerId: uid(240 + i),
        name: `Jugador ${String(i + 1).padStart(2, '0')}`,
        email: `jugador${i + 1}@example.com`,
        phone: `+54 9 11 4000-${String(1000 + i).padStart(4, '0')}`,
        bookingsCount: i + 1,
        noshowCount: i % 3,
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Header + 50 filas de datos, solo la tabla (desktop) queda en el árbol de accesibilidad.
    await expect(canvas.getAllByRole('row')).toHaveLength(51)
  },
}

/** Nombre real largo (compuesto + doble apellido): no debe romper el layout de la fila. */
export const NombresLargos: Story = {
  args: {
    players: [
      jugador({
        playerId: uid(225),
        name: 'María Fernanda Etcheverry Balcarce Domínguez',
        email: 'maria.fernanda.etcheverry.balcarce.dominguez@example.com',
        phone: '+54 9 11 9988-7766',
        bookingsCount: 3,
        noshowCount: 0,
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const table = within(within(canvasElement).getByRole('table'))
    await expect(
      table.getByText('María Fernanda Etcheverry Balcarce Domínguez'),
    ).toBeVisible()
  },
}
