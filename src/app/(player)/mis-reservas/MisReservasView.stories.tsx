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
    await expect(canvas.getByText('Jugada')).toBeInTheDocument()
    await expect(canvas.getByText('Ausente')).toBeInTheDocument()
    await expect(canvas.getByText('Cancelado (con reembolso)')).toBeInTheDocument()
    await expect(canvas.getByText('Cancelado (sin reembolso)')).toBeInTheDocument()
    await expect(canvas.getByText('Expirado')).toBeInTheDocument()
    // Solo la reserva 'completed' sin reseña propia muestra el botón.
    await expect(canvas.getAllByRole('button', { name: /dejar reseña/i })).toHaveLength(1)
  },
}

export const HistorialVacio: Story = {
  args: { tab: 'historial', upcomingCount: 0, bookings: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Historial vacío')).toBeInTheDocument()
  },
}
