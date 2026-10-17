import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { artDateString, daysFromNow } from '@/test/fixtures/clock'
import { courtFutbol5, courtFutbol7, courtFutbol11 } from '@/test/fixtures/court'
import { tenant, tenantAlt } from '@/test/fixtures/tenant'
import { paintedContrast } from '@/test/contrast'
import { PortalWorld } from '@/components/world/PortalWorld'
import MisReservasLoading from './loading'
import { MisReservasView, type MisReservasBookingRow } from './MisReservasView'

/**
 * `MisReservasBookingRow` es la proyección de la query cruda (JOIN
 * bookings/courts/tenants + EXISTS reviews, ver mis-reservas/page.tsx) — no
 * hay fixture de módulo para esta forma exacta; se arma acá a partir de
 * court.ts/tenant.ts/clock.ts para mantener fechas/nombres consistentes con
 * el resto de las stories.
 */
/** Hoy en ART según el reloj congelado de las stories (2026-03-14). */
const TODAY = artDateString(daysFromNow(0))

const row = (overrides: Partial<MisReservasBookingRow> = {}): MisReservasBookingRow => {
  const date = overrides.date ?? artDateString(daysFromNow(2))
  return {
    id: 'booking-1',
    date,
    starts_on: date,
    time_start: '18:00',
    time_end: '19:00',
    type: 'spontaneous',
    status: 'confirmed',
    price_snapshot: 1500000,
    court_name: courtFutbol5().name,
    court_format: courtFutbol5().format,
    tenant_name: tenant().name,
    tenant_slug: tenant().slug,
    address: 'Av. Pellegrini 1500, Rosario',
    directions_href: '/mapa-de-la-story',
    share_href: '/aviso-de-la-story',
    ended: false,
    canceled_by: null,
    has_review: false,
    cancellation_outcome: 'no_deposit',
    deposit_amount: 0,
    deposit_status: 'not_required',
    ...overrides,
  }
}

const meta = {
  title: 'Player/MisReservas/MisReservasView',
  component: MisReservasView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } },
  },
  args: {
    today: TODAY,
    cancelAction: fn(async () => ({
      success: true as const,
      booking: {} as never,
    })),
    page: 0,
    // Default bajo a propósito: con `total <= pageSize` el Pager nunca se
    // dibuja, que es el caso normal de casi todas las stories de acá. Las que
    // sí quieren mostrarlo (HistorialPaginado) lo pisan con un total real.
    total: 1,
    pageSize: 20,
  },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background">
          <Story />
        </div>
      </PortalWorld>
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
        deposit_status: 'captured',
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
    await expect(canvas.getByText('Cancelada', { exact: true })).toBeInTheDocument()
    await expect(canvas.getByText('Cancelada (sin reembolso)')).toBeInTheDocument()
    await expect(canvas.getByText('Expirada')).toBeInTheDocument()
    // Solo la reserva 'completed' sin reseña propia muestra el botón.
    await expect(canvas.getAllByRole('button', { name: /dejar reseña/i })).toHaveLength(1)
  },
}

/**
 * MEJORA-UX QA (mobile 375px): el badge "Cancelada (sin reembolso)" es
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
        deposit_status: 'captured',
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
    const name = canvas.getByText(/Cancha E2E 3/)
    const badge = canvas.getByText('Cancelada (sin reembolso)')
    await expect(name).toHaveTextContent('Cancha E2E 3')
    // Línea distinta (wrap real), no compartiendo fila con el badge largo.
    const gap = Math.abs(name.getBoundingClientRect().top - badge.getBoundingClientRect().top)
    await expect(gap).toBeGreaterThan(4)
  },
}

/**
 * Reserva `canceled_no_refund` que NUNCA tuvo seña paga (se canceló fuera de plazo
 * pero no había nada que perder): el badge dice "Cancelada" a secas. "(sin
 * reembolso)" sobre una reserva sin seña le haría creer al jugador que perdió plata.
 */
export const CanceladaSinSena: Story = {
  args: {
    tab: 'historial',
    upcomingCount: 0,
    bookings: [
      row({
        id: 'h-cancelada-sin-sena',
        status: 'canceled_no_refund',
        deposit_status: 'not_required',
        date: artDateString(daysFromNow(-2)),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cancelada', { exact: true })).toBeInTheDocument()
    await expect(canvas.queryByText(/sin reembolso/i)).not.toBeInTheDocument()
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
    // 45 con pageSize 20: tres páginas, la 2 (index 1) tiene anterior Y siguiente.
    total: 45,
    bookings: [row({ id: 'h1', date: artDateString(daysFromNow(-40)), status: 'completed' })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pager = canvas.getByRole('navigation', { name: 'Paginación de reservas' })
    // Pager compartido en modo total: dice el tramo visto sobre el total.
    await expect(within(pager).getByRole('status')).toHaveTextContent('45')
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
 * Página fuera de rango (link viejo/compartido): ni "no tenés reservas" ni
 * paginador — "esa página no existe" con un link de vuelta al principio.
 */
export const PaginaFueraDeRango: Story = {
  args: {
    tab: 'historial',
    upcomingCount: 0,
    page: 2,
    total: 1,
    bookings: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Esa página no existe')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /volver al principio/i })).toHaveAttribute(
      'href',
      '/mis-reservas?tab=historial',
    )
    await expect(
      canvas.queryByRole('navigation', { name: 'Paginación de reservas' }),
    ).not.toBeInTheDocument()
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

const refund = (state: 'pending' | 'settled'): MisReservasBookingRow['refund'] => ({
  amountCents: 500000,
  state,
  settledMethod: state === 'settled' ? 'transfer' : null,
  settledAt: state === 'settled' ? '2026-03-10T15:00:00.000Z' : null,
  bookingCode: 'K7M2QX',
  dateLabel: '10/03',
  timeLabel: '18:00',
  tenantName: tenant().name,
  tenantWhatsapp: '+54 9 341 555 0100',
  tenantPhone: '3415550100',
  tenantEmail: 'hola@complejo.test',
})

/** Una sola reserva: es "la próxima", completa y señada, con el grupo y cómo llegar a un toque. */
export const UnaReserva: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 1,
    bookings: [
      row({
        id: 'b-1',
        date: TODAY,
        status: 'confirmed',
        deposit_status: 'paid',
        deposit_amount: 500000,
        cancellation_outcome: 'refund',
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1, name: 'Mis reservas' })).toBeVisible()
    await expect(canvas.getByText('Hoy')).toBeVisible()
    await expect(canvas.getByText('18:00 a 19:00')).toBeVisible()
    await expect(canvas.getByText(/Señada, \$\s5\.000/)).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Avisarle al grupo' })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Cómo llegar' })).toBeVisible()
    await expect(canvas.getByRole('link', { name: /18:00 a 19:00/ })).toHaveAttribute(
      'href',
      '/reserva/b-1/exito',
    )
  },
}

/** Los estados de un turno por jugar: señada, sin seña, esperando seña, ya terminado y turno fijo. */
export const ProximosTodosLosEstados: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 5,
    bookings: [
      row({
        id: 'p-sena',
        date: TODAY,
        time_start: '21:00',
        time_end: '22:00',
        deposit_status: 'paid',
        deposit_amount: 500000,
        cancellation_outcome: 'refund',
      }),
      row({ id: 'p-sin-sena', date: artDateString(daysFromNow(1)) }),
      row({
        id: 'p-pendiente',
        status: 'pending_payment',
        share_href: null,
        date: artDateString(daysFromNow(2)),
        deposit_status: 'pending',
      }),
      row({ id: 'p-fijo', type: 'fixed', date: artDateString(daysFromNow(4)) }),
      row({
        id: 'p-terminado',
        date: TODAY,
        time_start: '09:00',
        time_end: '10:00',
        ended: true,
        share_href: null,
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Señada, \$\s5\.000/)).toBeVisible()
    await expect(canvas.getAllByText(/Pagás en el complejo/).length).toBeGreaterThan(0)
    await expect(canvas.getByText(/el turno se libera/)).toBeVisible()
    await expect(canvas.getByText('Este turno ya terminó.')).toBeVisible()
    // El turno ya terminado no se cancela; los otros tres confirmados sí.
    await expect(canvas.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(3)
  },
}

/** 20 en la página, la 1 de 3: solo la primera es "la próxima" y el paginador va debajo. */
export const VeintePorPagina: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 45,
    page: 0,
    total: 45,
    bookings: Array.from({ length: 20 }, (_, i) =>
      row({
        id: `v-${i}`,
        date: artDateString(daysFromNow(i + 1)),
        time_start: `${String(10 + (i % 10)).padStart(2, '0')}:00`,
        time_end: `${String(11 + (i % 10)).padStart(2, '0')}:00`,
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El paginador también arma una lista: se cuentan solo las tarjetas.
    await expect(canvas.getAllByRole('list')[0]!.querySelectorAll(':scope > li')).toHaveLength(20)
    await expect(canvas.getAllByRole('link', { name: 'Avisarle al grupo' })).toHaveLength(1)
    const pager = canvas.getByRole('navigation', { name: 'Paginación de reservas' })
    await expect(within(pager).getByRole('link', { name: /Siguientes/ })).toHaveAttribute(
      'href',
      '/mis-reservas?pagina=2',
    )
  },
}

/** El complejo oculta sus precios: ningún monto del turno; la seña propia y la devolución, sí. */
export const PreciosOcultos: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 2,
    bookings: [
      row({
        id: 'o-1',
        price_snapshot: null,
        date: artDateString(daysFromNow(1)),
        deposit_status: 'paid',
        deposit_amount: 500000,
        cancellation_outcome: 'refund',
      }),
      row({
        id: 'o-2',
        price_snapshot: null,
        status: 'canceled_refunded',
        canceled_by: 'player',
        deposit_status: 'refunded',
        deposit_amount: 500000,
        date: artDateString(daysFromNow(3)),
        refund: refund('pending'),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/Turno \$/)).toBeNull()
    await expect(canvas.queryByText(/15\.000/)).toBeNull()
    await expect(canvas.getByText(/Señada, \$\s5\.000/)).toBeVisible()
    await expect(canvas.getByText('Devolución pendiente')).toBeVisible()
  },
}

/** Nombres largos de complejo y de cancha, a 320 px: nada se corta ni desborda. */
export const NombresLargos: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 2,
    bookings: [
      row({
        id: 'n-1',
        date: artDateString(daysFromNow(1)),
        court_name: 'Cancha Techada Número Uno con Césped Sintético de Última Generación',
        tenant_name: 'Complejo Deportivo Club Atlético Sociedad de Fomento Barrio Parque Norte',
        address:
          'Avenida General José de San Martín y Bartolomé Mitre 12345, Villa Gobernador Gálvez',
      }),
      row({
        id: 'n-2',
        status: 'canceled_no_refund',
        deposit_status: 'captured',
        canceled_by: 'admin',
        date: artDateString(daysFromNow(2)),
        court_name: 'Cancha Techada Número Uno con Césped Sintético de Última Generación',
        tenant_name: 'Complejo Deportivo Club Atlético Sociedad de Fomento Barrio Parque Norte',
      }),
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    // Nada se sale de su tarjeta: ni el nombre de la cancha, ni el del complejo, ni la dirección.
    for (const li of canvasElement.querySelectorAll('li')) {
      const card = li.getBoundingClientRect()
      await expect(card.width).toBeLessThanOrEqual(320)
      for (const el of li.querySelectorAll('*')) {
        await expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(card.right + 1)
        await expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth + 1)
      }
    }
  },
}

/** Canceladas (las tres formas de decir quién) con la devolución pendiente y ya saldada. */
export const CanceladasYDevoluciones: Story = {
  args: {
    tab: 'historial',
    upcomingCount: 0,
    bookings: [
      row({
        id: 'c-jugador',
        status: 'canceled_refunded',
        canceled_by: 'player',
        deposit_status: 'refunded',
        deposit_amount: 500000,
        date: artDateString(daysFromNow(-1)),
        refund: refund('pending'),
      }),
      row({
        id: 'c-complejo',
        status: 'canceled_refunded',
        canceled_by: 'admin',
        deposit_status: 'refunded',
        deposit_amount: 500000,
        date: artDateString(daysFromNow(-2)),
        refund: refund('settled'),
      }),
      row({
        id: 'c-sin-dato',
        status: 'canceled_no_refund',
        date: artDateString(daysFromNow(-3)),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('La cancelaste vos.')).toBeVisible()
    await expect(canvas.getByText('La canceló el complejo.')).toBeVisible()
    await expect(canvas.getByText('Devolución pendiente')).toBeVisible()
    await expect(canvas.getByText('Devolución confirmada')).toBeVisible()
    await expect(canvas.getAllByRole('link', { name: 'Reservar de nuevo' })).toHaveLength(3)
  },
}

/** Ausente y expirada: dicen qué pasó, sin alarma. */
export const AusenteYExpirada: Story = {
  args: {
    tab: 'historial',
    upcomingCount: 0,
    bookings: [
      row({ id: 'a-1', status: 'no_show', date: artDateString(daysFromNow(-1)) }),
      row({ id: 'e-1', status: 'expired', date: artDateString(daysFromNow(-2)) }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/No te presentaste a este turno/)).toBeVisible()
    await expect(canvas.getByText(/No se pagó la seña a tiempo/)).toBeVisible()
  },
}

/**
 * Contraste MEDIDO (lo que se pinta: texto contra fondo, con el tema del runner) de lo que esta
 * pantalla agrega: notas, seña, pestaña inactiva, "Cancelar", acciones, badge de ausente y el
 * aviso de devolución. Corre en claro y en oscuro (`STORYBOOK_THEME=dark`).
 */
export const ContrasteMedido: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 2,
    bookings: [
      row({
        id: 'm-1',
        date: TODAY,
        deposit_status: 'paid',
        deposit_amount: 500000,
        cancellation_outcome: 'refund',
      }),
      row({ id: 'm-2', status: 'pending_payment', share_href: null, deposit_status: 'pending' }),
      row({ id: 'm-3', status: 'no_show', date: artDateString(daysFromNow(-1)) }),
      row({
        id: 'm-4',
        status: 'canceled_refunded',
        canceled_by: 'player',
        deposit_status: 'refunded',
        date: artDateString(daysFromNow(-2)),
        refund: refund('pending'),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const medidos: Array<[string, HTMLElement]> = [
      ['seña', canvas.getByText(/Señada, \$\s5\.000/)],
      ['esperando seña', canvas.getByText(/el turno se libera/)],
      ['ausente (texto)', canvas.getByText(/No te presentaste/)],
      ['ausente (badge)', canvas.getByText('Ausente')],
      ['quién canceló', canvas.getByText('La cancelaste vos.')],
      ['pestaña inactiva', canvas.getByRole('link', { name: 'Historial' })],
      ['cancelar', canvas.getByRole('button', { name: 'Cancelar' })],
      ['avisar al grupo', canvas.getByRole('link', { name: 'Avisarle al grupo' })],
      ['cómo llegar', canvas.getByRole('link', { name: 'Cómo llegar' })],
      ['reservar de nuevo', canvas.getAllByRole('link', { name: 'Reservar de nuevo' })[0]!],
      ['devolución', canvas.getByText('Devolución pendiente')],
      ['devolución (texto)', canvas.getByText(/te tiene que devolver/)],
    ]
    for (const [nombre, el] of medidos) {
      const ratio = await paintedContrast(el)
      await expect(ratio, nombre).toBeGreaterThanOrEqual(4.5)
    }
  },
}

/**
 * Un turno de hoy ya terminado no es "la próxima": la page lo manda al final y la vista destaca
 * la primera confirmada que todavía se juega.
 */
export const TerminadoDeHoyNoEsLaProxima: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 1,
    bookings: [
      row({
        id: 'terminado',
        date: TODAY,
        time_start: '09:00',
        time_end: '10:00',
        ended: true,
        share_href: null,
      }),
      row({
        id: 'futuro',
        date: artDateString(daysFromNow(1)),
        deposit_status: 'paid',
        deposit_amount: 500000,
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('link', { name: 'Avisarle al grupo' })).toHaveLength(1)
    // Aunque el terminado venga primero en la lista, la destacada es la que todavía se juega.
    const items = canvas.getAllByRole('listitem')
    await expect(within(items[0]!).getByText('Este turno ya terminó.')).toBeVisible()
    await expect(within(items[1]!).getByRole('link', { name: 'Avisarle al grupo' })).toBeVisible()
  },
}

/**
 * El esqueleto de `loading.tsx` mide lo que mide la tarjeta real, para que al llegar los datos
 * nada se mueva: la destacada (con seña, la más alta) y una compacta.
 */
export const AlturaDelEsqueleto: Story = {
  args: {
    tab: 'proximos',
    upcomingCount: 2,
    bookings: [
      row({
        id: 'proxima',
        date: artDateString(daysFromNow(1)),
        deposit_status: 'paid',
        deposit_amount: 500000,
      }),
      row({ id: 'compacta', date: artDateString(daysFromNow(2)) }),
    ],
  },
  render: (args) => (
    <>
      <div id="real">
        <MisReservasView {...args} />
      </div>
      <div id="esqueleto">
        <MisReservasLoading />
      </div>
    </>
  ),
  play: async ({ canvasElement }) => {
    const real = canvasElement.querySelectorAll('#real li')
    const esqueleto = canvasElement.querySelectorAll('#esqueleto .rounded-xl')
    // [0] son las pestañas; [1] la próxima; [2] una compacta.
    const alto = (el: Element | undefined) => el!.getBoundingClientRect().height
    await expect(Math.abs(alto(esqueleto[1]) - alto(real[0]))).toBeLessThanOrEqual(8)
    await expect(Math.abs(alto(esqueleto[2]) - alto(real[1]))).toBeLessThanOrEqual(8)
  },
}
