import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { artDateString, daysFromNow } from '@/test/fixtures/clock'
import { courtFutbol5, courtFutbol7, courtFutbol11 } from '@/test/fixtures/court'
import { tenant, tenantAlt } from '@/test/fixtures/tenant'
import { MisReservasView, type MisReservasBookingRow } from './MisReservasView'

/**
 * `MisReservasBookingRow` es la proyección de la query cruda (JOIN
 * bookings/courts/tenants + EXISTS reviews, ver mis-reservas/page.tsx) — no
 * hay fixture de módulo para esta forma exacta; se arma acá a partir de
 * court.ts/tenant.ts/clock.ts para mantener fechas/nombres consistentes con
 * el resto de las stories.
 */
const row = (overrides: Partial<MisReservasBookingRow> = {}): MisReservasBookingRow => ({
  id: 'booking-1',
  date: artDateString(daysFromNow(2)),
  time_start: '18:00',
  time_end: '19:00',
  type: 'spontaneous',
  status: 'confirmed',
  price_snapshot: 1500000,
  court_name: courtFutbol5().name,
  tenant_name: tenant().name,
  tenant_slug: tenant().slug,
  has_review: false,
  cancellation_outcome: 'no_deposit',
  deposit_amount: 0,
  ...overrides,
})

/** Reproduce `.player-shell-bg` (fondo del portal, ver ConfiguracionView.stories.tsx). */
const meta = {
  title: 'Player/MisReservas/MisReservasView',
  component: MisReservasView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } },
  },
  args: {
    cancelAction: fn(async () => ({
      success: true as const,
      booking: {} as never,
    })),
  },
  decorators: [
    (Story) => (
      <div className="player-shell-bg min-h-dvh py-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MisReservasView>

export default meta
type Story = StoryObj<typeof meta>

export const Proximos: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 2,
    bookings: [
      row({ id: 'b-1', status: 'confirmed', date: artDateString(daysFromNow(1)) }),
      row({
        id: 'b-2',
        status: 'pending_payment',
        date: artDateString(daysFromNow(3)),
        time_start: '20:00',
        time_end: '21:00',
        court_name: courtFutbol7().name,
        tenant_name: tenantAlt().name,
        tenant_slug: tenantAlt().slug,
      }),
    ],
  },
}

/** Turno fijo (abonado): badge "Turno fijo", sin CancelBookingButton propio de spontaneous. */
export const TurnoFijo: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 1,
    bookings: [row({ id: 'b-fixed', type: 'fixed', status: 'confirmed' })],
  },
}

export const ProximosVacio: Story = {
  args: { tab: 'proximos', upcomingCount: 0, bookings: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no tenés reservas')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /explorar complejos/i })).toHaveAttribute(
      'href',
      '/explorar',
    )
  },
}

/** Las 7 variantes de booking_status + no_show + ambas cancelaciones, en Historial. */
export const HistorialTodosLosEstados: Story = {
  args: {
    tab: 'historial',
    upcomingCount: 0,
    bookings: [
      row({
        id: 'h-completed-sin-resena',
        status: 'completed',
        date: artDateString(daysFromNow(-1)),
        has_review: false,
        court_name: courtFutbol11().name,
      }),
      row({
        id: 'h-completed-con-resena',
        status: 'completed',
        date: artDateString(daysFromNow(-3)),
        has_review: true,
      }),
      row({ id: 'h-no-show', status: 'no_show', date: artDateString(daysFromNow(-4)) }),
      row({
        id: 'h-canceled-refunded',
        status: 'canceled_refunded',
        date: artDateString(daysFromNow(-5)),
      }),
      row({
        id: 'h-canceled-no-refund',
        status: 'canceled_no_refund',
        date: artDateString(daysFromNow(-6)),
      }),
      row({ id: 'h-expired', status: 'expired', date: artDateString(daysFromNow(-7)) }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 2 reservas 'completed' (con y sin reseña) → 2 badges "Jugada".
    await expect(canvas.getAllByText('Jugada')).toHaveLength(2)
    await expect(canvas.getByText('Ausente')).toBeInTheDocument()
    await expect(canvas.getByText('Cancelado (con reembolso)')).toBeInTheDocument()
    await expect(canvas.getByText('Cancelado (sin reembolso)')).toBeInTheDocument()
    await expect(canvas.getByText('Expirado')).toBeInTheDocument()
    // Solo la reserva 'completed' sin reseña propia muestra el botón.
    await expect(canvas.getAllByRole('button', { name: /dejar reseña/i })).toHaveLength(1)
  },
}

/**
 * MEJORA-UX QA (mobile 375px): el badge "Cancelado (sin reembolso)" es
 * `shrink-0` y no cedía — el nombre de cancha/complejo (`min-w-0`, mismo
 * ancho compartido) se llevaba lo que sobraba: "Cancha E2E 3" quedaba en
 * "Can…" y "E2E Complejo Demo" en "E2E (". `flex-wrap` en el header de la
 * card larga el badge a su propia línea cuando no entra, en vez de angostar
 * el nombre — se verifica con geometría, no con el string (con badge corto
 * los dos ya compartían línea sin problema y eso también es válido).
 */
export const BadgeLargoNoAngostaElNombre: Story = {
  args: {
    tab: 'historial',
    upcomingCount: 0,
    bookings: [
      row({
        id: 'h-badge-largo',
        status: 'canceled_no_refund',
        date: artDateString(daysFromNow(-1)),
        court_name: 'Cancha E2E 3',
        tenant_name: 'E2E Complejo Demo',
      }),
    ],
  },
  // `parameters.viewport` no angosta el browser real del test runner (solo
  // afecta la UI manual de Storybook) — se fuerza el ancho angosto con un
  // contenedor propio, que es lo único que `flex-wrap` de verdad mira.
  decorators: [
    (Story) => (
      <div style={{ width: 375 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = canvas.getByText('Cancha E2E 3')
    const badge = canvas.getByText('Cancelado (sin reembolso)')
    await expect(name).toHaveTextContent('Cancha E2E 3')
    // Línea distinta (wrap real), no compartiendo fila con el badge largo.
    const gap = Math.abs(name.getBoundingClientRect().top - badge.getBoundingClientRect().top)
    await expect(gap).toBeGreaterThan(4)
  },
}

export const HistorialVacio: Story = {
  args: { tab: 'historial', upcomingCount: 0, bookings: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Historial vacío')).toBeInTheDocument()
  },
}

/**
 * B10 — el historial paginado. Antes la query traía 200 reservas y el corte
 * próximos/historial se hacía en JS; como el orden es por fecha descendente, lo
 * que se perdía era la COLA DEL HISTORIAL: un jugador de años no llegaba a sus
 * reservas más viejas y nada se lo decía.
 */
export const HistorialPaginado: Story = {
  args: {
    tab: 'historial',
    upcomingCount: 2,
    page: 1,
    hasMore: true,
    bookings: [row({ id: 'h1', date: artDateString(daysFromNow(-40)), status: 'completed' })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pager = canvas.getByRole('navigation', { name: 'Paginación de reservas' })
    await expect(pager).toHaveTextContent('Página 2')
    // Los dos links preservan el tab; la página 1 va sin `?pagina=`.
    await expect(within(pager).getByRole('link', { name: /Anteriores/ })).toHaveAttribute(
      'href',
      '/mis-reservas?tab=historial',
    )
    await expect(within(pager).getByRole('link', { name: /Siguientes/ })).toHaveAttribute(
      'href',
      '/mis-reservas?tab=historial&pagina=3',
    )
  },
}

/**
 * El caso normal: una sola página, sin paginador. Y el contador del hero sigue
 * diciendo la verdad aunque estemos parados en Historial — desde B10 sale de su
 * propia query, no de las filas en pantalla.
 */
export const SinPaginador: Story = {
  args: {
    tab: 'historial',
    upcomingCount: 3,
    bookings: [row({ id: 'h1', date: artDateString(daysFromNow(-5)), status: 'completed' })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.queryByRole('navigation', { name: 'Paginación de reservas' }),
    ).not.toBeInTheDocument()
    await expect(canvas.getByText('Tenés 3 turnos por jugar.')).toBeInTheDocument()
  },
}
