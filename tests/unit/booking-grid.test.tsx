// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { GridBooking } from '@/lib/booking/grid-cells'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// La grilla es "hoy 2026-06-10 12:00 ART": renderizar con date futura deja
// todos los slots interactivos; renderizar con date = hoy marca pasados.
vi.mock('@/hooks/use-art-now', () => ({
  useArtNow: () => ({ date: '2026-06-10', time: '12:00' }),
}))

vi.mock('@/hooks/use-booking-realtime', () => ({
  useBookingRealtime: (opts: { initialBookings: GridBooking[] }) => ({
    bookings: opts.initialBookings,
    status: 'SUBSCRIBED',
    refetch: vi.fn(),
  }),
}))

// BookingFormModal entra por next/dynamic: lo reemplazamos por un stub que
// expone el slot recibido para asertar fecha+hora pre-llenadas.
vi.mock('next/dynamic', () => ({
  default: () =>
    function MockBookingFormModal(props: {
      slot: { courtName: string; date: string; timeStart: string }
      open: boolean
    }) {
      if (!props.open) return null
      return (
        <div role="dialog" data-date={props.slot.date} data-time={props.slot.timeStart}>
          {props.slot.courtName}
        </div>
      )
    },
}))

import { BookingGrid } from '@/components/booking/BookingGrid'

afterEach(() => cleanup())

const OPENING: OpeningHours = {
  mon: { open: '08:00', close: '23:00' },
  tue: { open: '08:00', close: '23:00' },
  wed: { open: '08:00', close: '23:00' },
  thu: { open: '08:00', close: '23:00' },
  fri: { open: '08:00', close: '23:00' },
  sat: { open: '08:00', close: '23:00' },
  sun: { open: '08:00', close: '23:00' },
}

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
    pricing: { rules: [] },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

function booking(over: Partial<GridBooking>): GridBooking {
  return {
    id: 'b1',
    courtId: 'c1',
    date: '2026-06-12',
    timeStart: '16:00',
    timeEnd: '17:00',
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: 'Tomás',
    playerLastName: 'García',
    priceSnapshot: 2000000,
    ...over,
  }
}

function renderGrid(opts?: {
  courts?: CourtRow[]
  bookings?: GridBooking[]
  date?: string
}) {
  return render(
    <BookingGrid
      courts={opts?.courts ?? [court('c1', 'Cancha 1'), court('c2', 'Cancha 2')]}
      initialBookings={opts?.bookings ?? []}
      date={opts?.date ?? '2026-06-12'}
      tenantId="tenant-1"
      openingHours={OPENING}
      closedDates={[]}
      closesNextDay={false}
    />,
  )
}

describe('BookingGrid — layout CSS Grid', () => {
  it('renderiza un header por cancha (1 y 8 canchas)', () => {
    renderGrid({ courts: [court('c1', 'Única')] })
    expect(screen.getByText('Única')).toBeTruthy()
    cleanup()

    const eight = Array.from({ length: 8 }, (_, i) => court(`c${i}`, `Cancha ${i + 1}`))
    renderGrid({ courts: eight })
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(`Cancha ${i}`)).toBeTruthy()
    }
  })

  it('click en slot libre abre el modal con fecha y hora pre-llenadas', () => {
    renderGrid()
    fireEvent.click(
      screen.getByRole('button', { name: 'Reservar turno 16:00 en Cancha 1' }),
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('data-date')).toBe('2026-06-12')
    expect(dialog.getAttribute('data-time')).toBe('16:00')
    expect(dialog.textContent).toContain('Cancha 1')
  })

  it('una reserva confirmada muestra nombre y estado "Confirmada"', () => {
    renderGrid({ bookings: [booking({})] })
    // within(grid): la leyenda de abajo repite los nombres de estado.
    const grid = within(screen.getByTestId('booking-grid'))
    expect(grid.getByText('Tomás García')).toBeTruthy()
    expect(grid.getByText('Confirmada')).toBeTruthy()
    // El slot ocupado no ofrece botón de reservar.
    expect(
      screen.queryByRole('button', { name: 'Reservar turno 16:00 en Cancha 1' }),
    ).toBeNull()
  })

  it('abonado se distingue de reserva y de bloqueo', () => {
    renderGrid({
      bookings: [
        booking({ id: 'b1', type: 'fixed', timeStart: '16:00', timeEnd: '17:00' }),
        booking({ id: 'b2', type: 'block', timeStart: '18:00', timeEnd: '19:00', playerFirstName: null }),
      ],
    })
    const grid = within(screen.getByTestId('booking-grid'))
    expect(grid.getByText('Abonado')).toBeTruthy()
    expect(grid.getByText('Bloqueado')).toBeTruthy()
  })

  it('una reserva de 120 min ocupa dos filas (span 2) y no duplica celdas', () => {
    renderGrid({ bookings: [booking({ timeStart: '16:00', timeEnd: '18:00' })] })
    // El placement vive en el wrapper de la celda (el botón es su hijo).
    const cell = screen.getByLabelText(/Cancha 1 16:00–18:00/).parentElement as HTMLElement
    // Fila de header = 1; slot 16:00 con apertura 08:00 es la fila 10.
    expect(cell.style.gridRow).toBe('10 / span 2')
    // El slot 17:00 de esa cancha quedó cubierto: no hay botón libre.
    expect(
      screen.queryByRole('button', { name: 'Reservar turno 17:00 en Cancha 1' }),
    ).toBeNull()
  })

  it('los slots pasados no son clickeables', () => {
    // date = hoy (2026-06-10), artNow 12:00 → 08:00 pasado, 16:00 futuro.
    renderGrid({ date: '2026-06-10' })
    expect(
      screen.queryByRole('button', { name: 'Reservar turno 08:00 en Cancha 1' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Reservar turno 16:00 en Cancha 1' }),
    ).toBeTruthy()
  })

  it('las flechas mueven el foco entre slots', () => {
    renderGrid()
    const first = screen.getByRole('button', { name: 'Reservar turno 08:00 en Cancha 1' })
    first.focus()

    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Reservar turno 09:00 en Cancha 1',
    )

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Reservar turno 09:00 en Cancha 2',
    )
  })

  it('las flechas recorren también los slots ocupados y saltan filas cubiertas', () => {
    renderGrid({ bookings: [booking({ timeStart: '09:00', timeEnd: '11:00' })] })
    const first = screen.getByRole('button', { name: 'Reservar turno 08:00 en Cancha 1' })
    first.focus()

    // 09:00 está ocupado: el foco entra a la reserva (también es botón).
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('aria-label')).toContain('09:00–11:00')

    // 10:00 está cubierto por el span → el siguiente foco es 11:00.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Reservar turno 11:00 en Cancha 1',
    )
  })
})

describe('BookingGrid — popover de detalle', () => {
  const paid = booking({
    paymentMethod: 'cash',
    depositStatus: 'paid',
    depositAmount: 500000,
    priceSnapshot: 2000000,
  })

  it('focus en un slot ocupado muestra quién reservó, pago y seña', () => {
    renderGrid({ bookings: [paid] })
    const slot = screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ })

    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(slot)

    const tooltip = screen.getByRole('tooltip')
    expect(slot.getAttribute('aria-expanded')).toBe('true')
    expect(tooltip.textContent).toContain('Tomás García')
    expect(tooltip.textContent).toContain('Efectivo')
    expect(tooltip.textContent).toContain('Seña pagada')
    expect(tooltip.textContent).toContain('5.000') // monto de la seña
    expect(tooltip.textContent).toContain('20.000') // precio del turno

    fireEvent.blur(slot)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('hover abre el popover y mouseLeave lo cierra', async () => {
    renderGrid({ bookings: [paid] })
    const wrapper = screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ })
      .parentElement as HTMLElement

    fireEvent.mouseEnter(wrapper)
    expect(await screen.findByRole('tooltip')).toBeTruthy()

    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('Escape cierra el popover sin perder el foco', async () => {
    renderGrid({ bookings: [paid] })
    const slot = screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ })
    fireEvent.focus(slot)
    expect(await screen.findByRole('tooltip')).toBeTruthy()

    fireEvent.keyDown(slot, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('seña pendiente y sin datos de pago degradan con etiquetas claras', () => {
    renderGrid({
      bookings: [
        booking({ depositStatus: 'pending', depositAmount: 300000, paymentMethod: null }),
      ],
    })
    fireEvent.focus(screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ }))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.textContent).toContain('Seña pendiente')
    expect(tooltip.textContent).toContain('—') // método de pago sin registrar
  })

  it('un bloqueo no muestra datos de pago', () => {
    renderGrid({
      bookings: [booking({ type: 'block', playerFirstName: null, guestName: null })],
    })
    fireEvent.focus(screen.getByRole('button', { name: /Cancha 1 16:00–17:00/ }))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.textContent).toContain('Bloqueo')
    expect(tooltip.textContent).not.toContain('Seña')
    expect(tooltip.textContent).not.toContain('Precio')
  })
})
