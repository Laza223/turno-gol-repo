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
  lastActiveAt: '2026-03-10T22:00:00Z',
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

/**
 * "Ahora" fijo de las stories: `lastSeenLabel` calcula contra esto, así que el
 * "hace 5 semanas" no se corre con el calendario.
 */
const NOW_MS = Date.parse('2026-10-22T15:00:00Z')
const PUBLIC_URL = 'https://turnogol.com.ar/el-vagon'

const noop: JugadoresViewProps['linkAction'] = async () => ({ success: true })
const noopSearch: JugadoresViewProps['searchAction'] = async () => ({
  success: true,
  candidates: [],
})

/**
 * Vista Personas (lista única de clientes, admin+manager).
 * `content-area-gradient` reproduce el fondo real del shell admin
 * (admin-layout-shell.tsx, en el contenedor de contenido), donde vive esta vista
 * sin ningún wrapper propio — mismo patrón que StaffRosterView.
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
    dormantTotal: 0,
    tenantName: 'El Vagón',
    publicUrl: PUBLIC_URL,
    nowMs: NOW_MS,
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
    // aria-label por fila (H138): cada botón "Vincular" dice a quién vincula.
    await expect(table.getByRole('button', { name: 'Vincular a Diego Sosa' })).toBeVisible()
    await expect(table.getByRole('button', { name: 'Vincular a Marcos Peralta' })).toBeVisible()
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
    // Sin ningún cliente, las pastillas de filtro no aportan nada.
    await expect(
      canvas.queryByRole('navigation', { name: 'Filtrar personas' }),
    ).not.toBeInTheDocument()
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
 * B10 — la lista paginada, con el total (antes se cortaba en 200 sin decirlo:
 * la persona 201 no existía para esta pantalla y el único modo de alcanzarla
 * era adivinar su nombre en el buscador). 3 páginas de 50: esta es la del medio.
 */
export const ConPaginas: Story = {
  args: {
    clients: [jugador({ key: uid(301), playerId: uid(301), name: 'Ana Ruiz' })],
    q: 'ruiz',
    page: 1,
    total: 120,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pager = canvas.getByRole('navigation', { name: 'Paginación de personas' })
    await expect(pager).toHaveTextContent('Mostrando')
    await expect(pager).toHaveTextContent('120')
    // Los dos links preservan la búsqueda; la página 1 va sin `?pagina=`.
    await expect(within(pager).getByRole('link', { name: /Anteriores/ })).toHaveAttribute(
      'href',
      '/jugadores?q=ruiz',
    )
    await expect(within(pager).getByRole('link', { name: /Siguientes/ })).toHaveAttribute(
      'href',
      '/jugadores?q=ruiz&pagina=3',
    )
    // Las pastillas preservan la búsqueda y vuelven a la página 1.
    const filtros = within(canvas.getByRole('navigation', { name: 'Filtrar personas' }))
    await expect(filtros.getByRole('link', { name: 'Todas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(filtros.getByRole('link', { name: /Dejaron de venir/ })).toHaveAttribute(
      'href',
      '/jugadores?q=ruiz&filtro=dejaron-de-venir',
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

/** 50 registros: la tabla no se rompe con volumen (páginas de 50 en listTenantClients). */
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

/**
 * MEJORA-UX QA (mobile 390px): un contacto sin cuenta trunca agresivo porque
 * el badge "Sin cuenta" + el botón "Vincular" (los dos `shrink-0`) le
 * disputaban ancho al nombre en la misma línea. `title` es la salida en
 * desktop; en la card mobile el badge ahora larga a su propia línea
 * (`flex-wrap`) en vez de robarle ancho al nombre.
 */
export const ContactoNombreLargo: Story = {
  args: {
    clients: [
      contacto({
        key: '1122334456',
        name: 'Cliente QA Test con Nombre Bien Largo',
        phone: '11 2233-4456',
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    // ResponsiveList monta cards Y tabla a la vez (CSS decide cuál se ve) — se
    // escopea al <ul> de las cards, no a getByText a secas (matchea 2 veces).
    const cards = within(canvasElement.querySelector('ul')!)
    const nameEl = cards.getByText('Cliente QA Test con Nombre Bien Largo')
    await expect(nameEl).toHaveAttribute('title', 'Cliente QA Test con Nombre Bien Largo')
  },
}

/**
 * Filtro "Dejaron de venir": 3+ reservas y hace más de 4 semanas que no
 * reservan. La fila dice cuándo vino por última vez y la acción es escribirle
 * por WhatsApp con un mensaje ya redactado, que se manda a mano, uno por uno.
 * Decisión: docs/decisions/2026-10-22-clientes-que-dejaron-de-venir.md.
 */
export const DejaronDeVenir: Story = {
  args: {
    dormant: true,
    dormantTotal: 3,
    total: 3,
    clients: [
      jugador({ lastActiveAt: '2026-09-17T15:00:00Z' }),
      contacto({ lastActiveAt: '2026-09-03T15:00:00Z', fixedCount: 0 }),
      jugador({
        key: uid(226),
        playerId: uid(226),
        name: 'Lucas Benítez',
        email: 'lucas.benitez@example.com',
        phone: null,
        lastActiveAt: '2026-05-01T15:00:00Z',
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const filtros = within(canvas.getByRole('navigation', { name: 'Filtrar personas' }))
    const pill = filtros.getByRole('link', { name: /Dejaron de venir/ })
    await expect(pill).toHaveAttribute('aria-current', 'page')
    await expect(pill).toHaveTextContent('Dejaron de venir · 3')
    await expect(filtros.getByRole('link', { name: 'Todas' })).toHaveAttribute('href', '/jugadores')

    const table = within(canvas.getByRole('table'))
    await expect(table.getByRole('columnheader', { name: 'Última vez' })).toBeVisible()
    await expect(table.getByText('hace 5 semanas')).toBeVisible()
    await expect(table.getByText('hace 7 semanas')).toBeVisible()
    await expect(table.getByText('hace 5 meses')).toBeVisible()

    // El mensaje precargado es el que aprobó el dueño, con el primer nombre.
    const wa = table.getByRole('link', { name: 'Escribirle por WhatsApp a Tomás Ibáñez' })
    const href = wa.getAttribute('href') ?? ''
    await expect(href.startsWith('https://wa.me/5491133445566?text=')).toBe(true)
    await expect(new URL(href).searchParams.get('text')).toBe(
      `Hola Tomás! ¿Cómo andás? Te escribimos de El Vagón. Hace un tiempo que no te vemos por acá. Si querés volver, reservá acá: ${PUBLIC_URL}`,
    )
    await expect(wa).toHaveAttribute('target', '_blank')

    // El contacto sin cuenta también: el móvil sin 9 se normaliza.
    await expect(
      table.getByRole('link', { name: 'Escribirle por WhatsApp a Diego Sosa' }),
    ).toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\/5491122334455\?text=/))
    // "Vincular" se hace desde "Todas", no acá.
    await expect(table.queryByRole('button', { name: /Vincular/ })).not.toBeInTheDocument()
    // Sin teléfono no hay botón: un wa.me roto es peor que ninguno.
    await expect(
      table.queryByRole('link', { name: 'Escribirle por WhatsApp a Lucas Benítez' }),
    ).not.toBeInTheDocument()
  },
}

/** Sin URL absoluta de la app, el mensaje sale sin la invitación a reservar. */
export const DejaronDeVenirSinLink: Story = {
  args: {
    dormant: true,
    dormantTotal: 1,
    publicUrl: null,
    clients: [jugador({ lastActiveAt: '2026-09-17T15:00:00Z' })],
  },
  play: async ({ canvasElement }) => {
    const table = within(within(canvasElement).getByRole('table'))
    const wa = table.getByRole('link', { name: 'Escribirle por WhatsApp a Tomás Ibáñez' })
    await expect(new URL(wa.getAttribute('href') ?? '').searchParams.get('text')).toBe(
      'Hola Tomás! ¿Cómo andás? Te escribimos de El Vagón. Hace un tiempo que no te vemos por acá.',
    )
  },
}

/** Nadie dejó de venir: el vacío explica qué aparecería acá. */
export const DejaronDeVenirVacio: Story = {
  args: { dormant: true, dormantTotal: 0, clients: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nadie dejó de venir')).toBeInTheDocument()
    await expect(
      canvas.getByText(
        'Acá aparecen los clientes con 3 reservas o más que hace 4 semanas no reservan.',
      ),
    ).toBeInTheDocument()
    // Las pastillas siguen: es la salida de vuelta a "Todas".
    await expect(canvas.getByRole('link', { name: 'Todas' })).toHaveAttribute('href', '/jugadores')
  },
}
