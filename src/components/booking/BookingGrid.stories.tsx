import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, mocked, userEvent, waitFor, within } from 'storybook/test'
import { vi } from 'vitest'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { courts } from '@/test/fixtures/court'
import { openingHours, tenant } from '@/test/fixtures/tenant'
import { booking, saturdayAfternoonGridBookings } from '@/test/fixtures/booking'
import { BookingGrid } from './BookingGrid'

/**
 * Contenedor top-level de la grilla: NO se extrae en una vista presentacional
 * (su contrato de 7+1 props ya es limpio). `useBookingRealtime` (canal
 * Supabase + polling de respaldo) se mockea como módulo — es un hook común,
 * no un `'use server'`, así que Vite lo carga sin arrastrar drizzle/postgres.
 * `useRouter` ya lo mockea el framework (`parameters.nextjs`).
 *
 * `sb.mock()` de `storybook/test` es un no-op en esta versión instalada
 * (@storybook/addon-vitest 10.5.0 + @vitest/mocker 3.2.7): el hoisting de
 * `@vitest/mocker` solo reconoce `vi.`/`vitest.` como object name (ver
 * `hoistMocksPlugin` en `@vitest/mocker/dist/node.js`), no `sb.` — con
 * `sb.mock()` el hook queda SIN mockear y `mocked(useBookingRealtime)` no es
 * un mock real (`.mockReturnValue is not a function`). `vi.mock()` importado
 * directo de `'vitest'` sí hoistea correctamente y no está en la lista de
 * imports server-only prohibidos por el eslintrc de `*.stories.tsx`.
 *
 * `BookingFormModal` entra por `next/dynamic` y solo se monta cuando
 * `selectedSlot` deja de ser null (click en un slot libre) — ninguna de estas
 * stories dispara ese click, así que el chunk nunca se pide y `action` (la
 * Server Action real en la app) puede quedar como un stub sin comprometer el
 * aislamiento.
 */
vi.mock(import('@/hooks/use-booking-realtime'))

const meta = {
  title: 'Booking/Grid/BookingGrid',
  component: BookingGrid,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/grilla', query: { date: '2026-03-14' } },
    },
  },
  args: {
    courts: courts(),
    initialBookings: saturdayAfternoonGridBookings(),
    date: '2026-03-14',
    tenantId: tenant().id,
    openingHours: openingHours(),
    closedDates: [],
    closesNextDay: false,
    action: fn(async () => ({ success: true as const, booking: booking() })),
  },
  decorators: [
    (Story) => (
      <div className="flex h-168 flex-col p-4">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    // Los hints/densidad viven en localStorage con una key fija: sin limpiarla
    // el resultado de una story anterior (ej. "descartar el hint") se filtra acá.
    localStorage.removeItem('tg-hint-grilla-primera-reserva')
    localStorage.removeItem('tg-grilla-density')
    mocked(useBookingRealtime).mockReturnValue({
      bookings: saturdayAfternoonGridBookings(),
      status: 'SUBSCRIBED',
      refetch: fn(async () => {}),
    })
  },
} satisfies Meta<typeof BookingGrid>

export default meta
type Story = StoryObj<typeof meta>

/** Tarde de sábado llena (4 canchas, una offline), Realtime conectado. */
export const Default: Story = {}

export const SinCanchas: Story = {
  name: 'courts=[] — EmptyState "Sin canchas configuradas" con CTA a /canchas',
  args: { courts: [], initialBookings: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin canchas configuradas')).toBeInTheDocument()
    await expect(
      canvas.getByRole('link', { name: 'Configurar la primera cancha' }),
    ).toHaveAttribute('href', '/canchas')
  },
}

export const ComplejoCerrado: Story = {
  name: 'Día marcado como cerrado — EmptyState con CTA a horarios',
  args: { closedDates: ['2026-03-14'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Complejo cerrado este día')).toBeInTheDocument()
    await expect(
      canvas.getByRole('link', { name: 'Revisar horarios' }),
    ).toHaveAttribute('href', '/settings/horarios')
  },
}

export const ConexionInestable: Story = {
  name: 'status=OFFLINE — banner ámbar de reconexión',
  beforeEach: () => {
    mocked(useBookingRealtime).mockReturnValue({
      bookings: saturdayAfternoonGridBookings(),
      status: 'OFFLINE',
      refetch: fn(async () => {}),
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Sin conexión. Los datos pueden no estar actualizados.'),
    ).toBeInTheDocument()
  },
}

export const PrimeraReserva: Story = {
  name: 'Sin reservas + hint nunca descartado → FirstBookingHint',
  beforeEach: () => {
    mocked(useBookingRealtime).mockReturnValue({
      bookings: [],
      status: 'SUBSCRIBED',
      refetch: fn(async () => {}),
    })
  },
  args: { initialBookings: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Tocá cualquier horario libre para cargar tu primera reserva.'),
    ).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Entendido' }))
    await waitFor(() =>
      expect(
        canvas.queryByText('Tocá cualquier horario libre para cargar tu primera reserva.'),
      ).not.toBeInTheDocument(),
    )
  },
}

export const DetalleDeReserva: Story = {
  name: 'Click en una reserva abre su popover de detalle',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const slot = canvas.getByRole('button', { name: /Cancha 1 15:00–16:00/ })
    await userEvent.click(slot)
    // El popover va portaled a document.body (ui/popover.tsx): fuera del subárbol de canvasElement.
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('dialog')).toBeInTheDocument()
  },
}
