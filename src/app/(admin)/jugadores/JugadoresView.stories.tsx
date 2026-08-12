import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import type { ClientListRow } from './queries'
import { JugadoresView, type JugadoresViewProps } from './JugadoresView'

/**
 * `ClientListRow` viene de `./queries.ts` (route-local, sin *.types.ts propio,
 * como `ReservaDetail` en reservas/[id]/BookingDetailCard.stories.tsx) —
 * `import type` se borra al compilar, no arrastra drizzle al bundle.
 */
const jugador = (overrides: Partial<ClientListRow> = {}): ClientListRow => ({
  key: uid(221),
  kind: 'player',
  playerId: uid(221),
  name: 'Tomás Ibáñez',
  email: 'tomas.ibanez@example.com',
  phone: '+54 9 11 3344-5566',
  bookingsCount: 12,
  noshowCount: 0,
  lastBookingAt: '2026-03-10',
  tags: [],
  fixedCount: 0,
  suggestedPlayerId: null,
  suggestedPlayerName: null,
  ...overrides,
})

/** Persona sin cuenta: existe solo como titular de un turno fijo (B13). */
const contacto = (overrides: Partial<ClientListRow> = {}): ClientListRow => ({
  ...jugador(),
  key: '1122334455',
  kind: 'contact',
  playerId: null,
  name: 'Diego Sosa',
  email: null,
  phone: '11 2233-4455',
  bookingsCount: 8,
  noshowCount: 0,
  tags: [],
  fixedCount: 1,
  suggestedPlayerId: null,
  suggestedPlayerName: null,
  ...overrides,
})

const CLIENTES: ClientListRow[] = [
  jugador(),
  jugador({
    key: uid(222),
    playerId: uid(222),
    name: 'Julián Álvarez',
    email: 'julian.alvarez@example.com',
    phone: '+54 9 11 2233-4455',
    bookingsCount: 5,
    noshowCount: 2,
  }),
  jugador({
    key: uid(223),
    playerId: uid(223),
    name: 'Juan Ignacio Rodríguez Etchegoyen',
    email: 'juan.ignacio.rodriguez.etchegoyen@example.com',
    phone: '+54 9 11 5566-7788',
    bookingsCount: 40,
    noshowCount: 1,
    fixedCount: 2,
  }),
]

const noop: JugadoresViewProps['linkAction'] = async () => ({ success: true })
const noopSearch: JugadoresViewProps['searchAction'] = async () => ({
  success: true,
  candidates: [],
})

/**
 * Vista Personas (lista única de clientes, admin+manager).
 * `content-area-gradient` reproduce el fondo real del `<main>` del shell admin
 * (admin-layout-shell.tsx), donde vive esta vista sin ningún wrapper propio —
 * mismo patrón que StaffRosterView.
 */
const meta = {
  title: 'Admin/Jugadores/JugadoresView',
  component: JugadoresView,
  parameters: { layout: 'fullscreen' },
  args: {
    clients: CLIENTES,
    q: undefined,
    searchAction: noopSearch,
    linkAction: noop,
  },
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

/**
 * El caso que justifica B13: el "Diego del fijo de los lunes" no tiene cuenta y
 * antes no aparecía en ninguna lista de personas. Ahora aparece, marcado, y con
 * la acción de vincularlo.
 */
export const ConPersonasSinCuenta: Story = {
  args: {
    clients: [
      jugador(),
      contacto(),
      contacto({
        key: '1155667788',
        name: 'Marcos Peralta',
        phone: '+54 9 11 5566-7788',
        fixedCount: 2,
        bookingsCount: 16,
        suggestedPlayerId: uid(223),
        suggestedPlayerName: 'Juan Ignacio Rodríguez Etchegoyen',
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const table = within(within(canvasElement).getByRole('table'))
    await expect(table.getByText('Diego Sosa')).toBeVisible()
    await expect(table.getAllByText('Sin cuenta')).toHaveLength(2)
    // La sugerencia por teléfono se muestra, pero NUNCA vincula sola.
    await expect(
      table.getByText('Mismo teléfono que Juan Ignacio Rodríguez Etchegoyen'),
    ).toBeVisible()
    await expect(table.getAllByRole('button', { name: 'Vincular' })).toHaveLength(2)
  },
}

/** Complejo recién onboardeado: sin clientes todavía. */
export const Vacio: Story = {
  args: { clients: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no tenés clientes')).toBeInTheDocument()
    await expect(
      canvas.getByRole('link', { name: 'Compartí tu link desde el panel' }),
    ).toHaveAttribute('href', '/dashboard')
  },
}

/** `q` con resultados vacíos: el copy de empty state cambia respecto del listado sin filtro. */
export const BusquedaSinResultados: Story = {
  args: { clients: [], q: 'nombre-inexistente' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('No se encontraron personas que coincidan con la búsqueda.'),
    ).toBeInTheDocument()
  },
}

/**
 * B10 — la lista paginada. Antes se cortaba en 200 sin decirlo: la persona 201
 * no existía para esta pantalla y el único modo de alcanzarla era adivinar su
 * nombre en el buscador.
 */
export const ConPaginas: Story = {
  args: {
    clients: [jugador({ key: uid(301), playerId: uid(301), name: 'Ana Ruiz' })],
    q: 'ruiz',
    page: 1,
    hasMore: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pager = canvas.getByRole('navigation', { name: 'Paginación de personas' })
    await expect(pager).toHaveTextContent('Página 2')
    // Los dos links preservan la búsqueda; la página 1 va sin `?pagina=`.
    await expect(within(pager).getByRole('link', { name: /Anteriores/ })).toHaveAttribute(
      'href',
      '/jugadores?q=ruiz',
    )
    await expect(within(pager).getByRole('link', { name: /Siguientes/ })).toHaveAttribute(
      'href',
      '/jugadores?q=ruiz&pagina=3',
    )
  },
}

/** Una sola página: el paginador no aparece — sería ruido en el caso normal. */
export const SinPaginador: Story = {
  args: { clients: [jugador({ key: uid(302), playerId: uid(302) })] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.queryByRole('navigation', { name: 'Paginación de personas' }),
    ).not.toBeInTheDocument()
  },
}

/** 50 registros: la tabla no se rompe con volumen (páginas de 100 en listTenantClients). */
export const MuchosRegistros: Story = {
  args: {
    clients: Array.from({ length: 50 }, (_, i) =>
      jugador({
        key: uid(240 + i),
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
    clients: [
      jugador({
        key: uid(225),
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
    await expect(table.getByText('María Fernanda Etcheverry Balcarce Domínguez')).toBeVisible()
  },
}
