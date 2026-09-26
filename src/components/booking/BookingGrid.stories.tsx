import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, mocked, userEvent, waitFor, within } from 'storybook/test'
import { vi } from 'vitest'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { court, courts } from '@/test/fixtures/court'
import { openingHours, tenant } from '@/test/fixtures/tenant'
import { booking, saturdayAfternoonGridBookings } from '@/test/fixtures/booking'
import { uid } from '@/test/fixtures/ids'
import { abonado } from '@/test/fixtures/abonado'
import { ADMIN_HEADER_SLOT_ID } from '@/components/layout/admin-header-slot'
import type { GridBooking } from '@/lib/booking/grid-cells'
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
    action: fn(async () => ({
      success: true as const,
      booking: booking(),
    })),
    createAbonadoAction: fn(async () => ({
      success: true as const,
      abonado: abonado(),
      slotsGenerated: 8,
      conflictDates: [],
    })),
    // Doble mínimo: el comportamiento real del modal (cobrar, cantina,
    // reprogramar…) lo cubre HoyChargeModal.stories.tsx. Acá solo importa que
    // GridOverlays invoque el render prop al tocar un turno — `@/components`
    // no puede importar el modal real de `@/app` (turnogol/capas-components).
    renderChargeModal: (args) => (
      <div role="dialog" aria-label={`Detalle del turno ${args.booking.id}`}>
        Detalle
      </div>
    ),
  },
  decorators: [
    (Story) => (
      // El div con el id del slot hace de barra superior del panel: los
      // controles de la grilla (semana, "Hoy", el chip y el menú) se portalizan
      // ahí, igual que en la app. Sin él la story se vería sin ellos.
      <div className="flex h-168 flex-col p-4">
        <div
          id={ADMIN_HEADER_SLOT_ID}
          className="mb-2 flex h-15 shrink-0 items-center gap-3 rounded-lg border border-border bg-card px-3"
        />
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    // El hint vive en localStorage con una key fija: sin limpiarla el resultado
    // de una story anterior ("descartar el hint") se filtra acá.
    localStorage.removeItem('tg-hint-grilla-primera-reserva')
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
    await expect(canvas.getByRole('link', { name: 'Revisar horarios' })).toHaveAttribute(
      'href',
      '/settings/horarios',
    )
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
    // BookingGrid debouncea 1.5s antes de mostrar el banner (blips
    // auto-recuperables no deben alarmar) — findByText espera ese delay.
    await expect(
      await canvas.findByText(
        'Sin conexión. Los datos pueden no estar actualizados.',
        {},
        { timeout: 3000 },
      ),
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

/**
 * "No cobrado" en rojo (`destructive`, decisión del dueño 2026-09-25 — revierte
 * el ámbar del refinamiento 2026-09-24): un turno jugado con saldo y otro
 * confirmado con saldo. La celda jugada dice "No cobrado" sin anillo — es lo
 * normal de la media hora que sigue al partido —, y el chip "N sin cobrar"
 * (rojo) le pone un anillo rojo a los dos al encenderse.
 */
export const PorCobrarHoy: Story = {
  name: 'Chip "N sin cobrar" encendido → anillo rojo en los que deben',
  beforeEach: () => {
    const [played, upcoming, ...rest] = saturdayAfternoonGridBookings().map((b) => ({
      ...b,
      date: '2026-03-14',
    }))
    mocked(useBookingRealtime).mockReturnValue({
      bookings: [
        { ...played!, status: 'completed', totalPaid: 0, pending: played!.priceSnapshot },
        { ...upcoming!, status: 'confirmed', totalPaid: 0, pending: upcoming!.priceSnapshot },
        ...rest,
      ],
      status: 'SUBSCRIBED',
      refetch: fn(async () => {}),
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cell = canvas.getByRole('button', { name: /No cobrado, falta cobrar/ })
    // Sin chip: ningún anillo. El que respiraba ya no existe.
    await expect(cell.className).not.toMatch(/ring-warning|ring-destructive|slot-alarm/)

    const chip = await canvas.findByRole('button', { name: /sin cobrar/ })
    await userEvent.click(chip)
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(cell.className).toMatch(/ring-destructive/))
    await expect(cell.className).not.toMatch(/ring-warning/)
  },
}

export const DetalleDeReserva: Story = {
  name: 'Click en una reserva abre su popover de detalle',
  // Los fixtures caen en el día de hoy y la story mira el 2026-03-14: la grilla
  // no abre el modal de un turno de otro día (es lo que pasa al reprogramarlo),
  // así que acá los turnos tienen que ser del día que se muestra.
  beforeEach: () => {
    mocked(useBookingRealtime).mockReturnValue({
      bookings: saturdayAfternoonGridBookings().map((b) => ({ ...b, date: '2026-03-14' })),
      status: 'SUBSCRIBED',
      refetch: fn(async () => {}),
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const slot = canvas.getByRole('button', { name: /Cancha 1 15:00–16:00/ })
    await userEvent.click(slot)
    // El popover va portaled a document.body (ui/popover.tsx): fuera del subárbol de canvasElement.
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('dialog')).toBeInTheDocument()
  },
}

// ─── Día lleno, muchas canchas (variante "Entra entera", 2026-09-25) ───────

/** N canchas alternando F5/F7 — el mismo criterio que `datos.ts` de la variante. */
function fullGridCourts(n: number) {
  return Array.from({ length: n }, (_, i) =>
    court({ id: uid(210 + i), name: `Cancha ${i + 1}`, format: i < Math.ceil(n / 2) ? 5 : 7 }),
  )
}

/**
 * Un día lleno "visto a las 15:30" — el reloj de Storybook está congelado en
 * FROZEN_NOW (no a las 20:10 de la lámina, que no se puede simular sin
 * mockear `Date.now()` por story): jugado pagado (verde), jugado sin cobrar
 * (rojo), uno a medias (rojo, "Falta $X"), uno en juego (15:00–16:00, cruza
 * las 15:30), próximos, un evento de 3h, una escuelita a $0, un bloqueo y un
 * "Esperando seña". Cicla sobre las canchas disponibles (`% courtIds.length`)
 * para que la misma lista sirva para 5 y para 12 canchas sin pisarse — los
 * horarios están elegidos para que dos turnos en la misma cancha reciclada
 * nunca se superpongan.
 */
function fullDayBookings(courtIds: string[]): GridBooking[] {
  const at = (i: number) => courtIds[i % courtIds.length]!
  const base = (
    over: Partial<GridBooking> & Pick<GridBooking, 'id' | 'courtId' | 'timeStart' | 'timeEnd'>,
  ): GridBooking => ({
    date: '2026-03-14',
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 1500000,
    ...over,
  })
  return [
    base({
      id: 'full-1',
      courtId: at(0),
      timeStart: '11:00',
      timeEnd: '12:00',
      status: 'completed',
      guestName: 'Martín Gómez',
      totalPaid: 1500000,
      pending: 0,
    }),
    base({
      id: 'full-2',
      courtId: at(1),
      timeStart: '14:00',
      timeEnd: '15:00',
      status: 'completed',
      guestName: 'Fede Ramírez',
      totalPaid: 0,
      pending: 1500000,
    }),
    base({
      id: 'full-3',
      courtId: at(2),
      timeStart: '14:00',
      timeEnd: '15:00',
      status: 'completed',
      guestName: 'Diego Fernández',
      totalPaid: 750000,
      pending: 750000,
    }),
    base({
      id: 'full-4',
      courtId: at(3),
      timeStart: '15:00',
      timeEnd: '16:00',
      guestName: 'Nicolás Pereyra',
      pending: 1500000,
      totalPaid: 0,
    }),
    base({
      id: 'full-5',
      courtId: at(4),
      timeStart: '17:00',
      timeEnd: '18:00',
      guestName: 'Pablo Acosta',
      pending: 1500000,
      totalPaid: 0,
    }),
    base({
      id: 'full-6',
      courtId: at(5),
      timeStart: '18:00',
      timeEnd: '21:00',
      guestName: 'Cumple de Tobías',
      priceSnapshot: 4500000,
      pending: 4500000,
      totalPaid: 0,
    }),
    base({
      id: 'full-7',
      courtId: at(6),
      timeStart: '16:00',
      timeEnd: '17:00',
      guestName: 'Escuelita Pequeños Cracks',
      priceSnapshot: 0,
      pending: 0,
      totalPaid: 0,
    }),
    base({
      id: 'full-8',
      courtId: at(7),
      timeStart: '13:00',
      timeEnd: '14:00',
      type: 'block',
      guestName: 'Cambio de red',
      priceSnapshot: 0,
    }),
    base({
      id: 'full-9',
      courtId: at(8),
      timeStart: '20:00',
      timeEnd: '21:00',
      status: 'pending_payment',
      guestName: 'Tomás Herrera',
      createdAt: new Date('2026-03-14T18:28:00.000Z'), // 2 min antes de FROZEN_NOW
    }),
  ]
}

export const DoceCanchas: Story = {
  name: '12 canchas — día lleno (variante "Entra entera")',
  args: { courts: fullGridCourts(12) },
  beforeEach: () => {
    mocked(useBookingRealtime).mockReturnValue({
      bookings: fullDayBookings(fullGridCourts(12).map((c) => c.id)),
      status: 'SUBSCRIBED',
      refetch: fn(async () => {}),
    })
  },
}

export const CincoCanchas: Story = {
  name: '5 canchas — día lleno (variante "Entra entera")',
  args: { courts: fullGridCourts(5) },
  beforeEach: () => {
    mocked(useBookingRealtime).mockReturnValue({
      bookings: fullDayBookings(fullGridCourts(5).map((c) => c.id)),
      status: 'SUBSCRIBED',
      refetch: fn(async () => {}),
    })
  },
}
