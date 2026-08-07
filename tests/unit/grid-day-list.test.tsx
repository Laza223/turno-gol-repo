// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * La grilla-lista de mobile (Fase 4): una cancha por página con swipe, más una
 * página "Todas" que conserva la lectura por hora que el swipe pierde.
 *
 * El harness es el de `booking-grid.test.tsx`, con UNA diferencia que es todo
 * el punto: acá `matchMedia` responde que NO estamos en escritorio. Ese es el
 * único interruptor entre las dos vistas — nunca están montadas las dos (los
 * popovers de Radix se portalizan al body y `display:none` no los alcanza).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

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

vi.mock('next/dynamic', () => ({
  default: () => function Stub() { return null },
}))

import { BookingGrid } from '@/components/booking/BookingGrid'

const ORIGINAL_MATCH_MEDIA = window.matchMedia

/** `matches:false` para el query de escritorio → se monta la lista. */
function mockViewport(desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 1024px') ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => mockViewport(false))
afterEach(() => {
  cleanup()
  window.matchMedia = ORIGINAL_MATCH_MEDIA
})

const OPENING: OpeningHours = {
  mon: { open: '16:00', close: '19:00' },
  tue: { open: '16:00', close: '19:00' },
  wed: { open: '16:00', close: '19:00' },
  thu: { open: '16:00', close: '19:00' },
  fri: { open: '16:00', close: '19:00' },
  sat: { open: '16:00', close: '19:00' },
  sun: { open: '16:00', close: '19:00' },
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
    pricing: {
      rules: [
        {
          days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          from: '16:00',
          to: '19:00',
          price: 2400000,
        },
      ],
    },
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

function renderGrid(opts?: { courts?: CourtRow[]; bookings?: GridBooking[]; depositPercentage?: number }) {
  return render(
    <BookingGrid
      courts={opts?.courts ?? [court('c1', 'Cancha 1'), court('c2', 'Cancha 2')]}
      initialBookings={opts?.bookings ?? []}
      date="2026-06-12"
      tenantId="tenant-1"
      openingHours={OPENING}
      closedDates={[]}
      closesNextDay={false}
      action={vi.fn()}
      depositPercentage={opts?.depositPercentage}
    />,
  )
}

describe('GridDayList — la grilla en mobile', () => {
  it('en mobile se monta la lista y NO la matriz', () => {
    renderGrid()
    expect(screen.getByTestId('booking-day-list')).toBeTruthy()
    expect(screen.queryByTestId('booking-grid')).toBeNull()
  })

  it('en escritorio se monta la matriz y NO la lista', () => {
    mockViewport(true)
    renderGrid()
    expect(screen.getByTestId('booking-grid')).toBeTruthy()
    expect(screen.queryByTestId('booking-day-list')).toBeNull()
  })

  it('la primera página es "Todas" y después va una por cancha', () => {
    renderGrid()
    const selector = screen.getByRole('group', { name: 'Elegir cancha' })
    const pills = within(selector).getAllByRole('button')
    expect(pills.map((p) => p.textContent)).toEqual(['Todas', 'Cancha 1', 'Cancha 2'])
    // "Todas" arranca seleccionada.
    expect(pills[0]!.getAttribute('aria-pressed')).toBe('true')
  })

  it('la página "Todas" muestra cada hora con todas sus canchas', () => {
    renderGrid()
    const todas = screen.getByRole('region', { name: 'Todas las canchas' })
    // 16:00, 17:00 y 18:00 (cierre 19:00).
    expect(within(todas).getByText('16:00–17:00')).toBeTruthy()
    expect(within(todas).getByText('18:00–19:00')).toBeTruthy()
    // Cada hora ofrece las 2 canchas libres.
    expect(within(todas).getByRole('button', { name: 'Reservar 16:00 en Cancha 1' })).toBeTruthy()
    expect(within(todas).getByRole('button', { name: 'Reservar 16:00 en Cancha 2' })).toBeTruthy()
  })

  it('un turno ocupado se lee en "Todas" con su estado y abre el panel', () => {
    renderGrid({ bookings: [booking({})] })
    const todas = screen.getByRole('region', { name: 'Todas las canchas' })
    const chip = within(todas).getByRole('button', { name: 'Cancha 1 a las 16:00: Confirmada' })
    expect(chip).toBeTruthy()
    // La cancha 1 ya no ofrece reservar esa hora; la 2 sí.
    expect(within(todas).queryByRole('button', { name: 'Reservar 16:00 en Cancha 1' })).toBeNull()
    expect(within(todas).getByRole('button', { name: 'Reservar 16:00 en Cancha 2' })).toBeTruthy()
  })

  it('la página de una cancha lista sus horas con nombre y estado', () => {
    renderGrid({ bookings: [booking({})] })
    const page = screen.getByRole('region', { name: 'Cancha 1' })
    expect(
      within(page).getByRole('button', {
        name: 'Turno de 16:00 a 17:00 en Cancha 1, Tomás García',
      }),
    ).toBeTruthy()
    expect(within(page).getByRole('button', { name: 'Reservar 17:00 en Cancha 1' })).toBeTruthy()
  })

  it('los nombres accesibles NO chocan con los de la matriz', () => {
    renderGrid()
    // La matriz usa "Reservar turno 16:00 en Cancha 1"; la lista, sin "turno".
    expect(screen.queryByRole('button', { name: /Reservar turno/i })).toBeNull()
  })

  it('una cancha pausada no ofrece reservar', () => {
    renderGrid({ courts: [court('c1', 'Cancha 1', 'offline')] })
    const page = screen.getByRole('region', { name: 'Cancha 1' })
    const row = within(page).getByRole('button', { name: 'Reservar 16:00 en Cancha 1' })
    expect(row.hasAttribute('disabled')).toBe(true)
  })

  it('tocar un slot libre abre el alta rápida cuando hay porcentaje de seña', () => {
    renderGrid({ depositPercentage: 30 })
    const page = screen.getByRole('region', { name: 'Cancha 1' })
    fireEvent.click(within(page).getByRole('button', { name: 'Reservar 16:00 en Cancha 1' }))
    expect(screen.getByLabelText('¿A nombre de quién?')).toBeTruthy()
  })

  it('el carrusel navega con las flechas del teclado', () => {
    renderGrid()
    const track = screen.getByRole('group', { name: 'Canchas del día' })
    // happy-dom no implementa scrollTo: el componente igual actualiza el
    // índice, que es lo observable (la píldora activa).
    track.scrollTo = (() => {}) as unknown as typeof track.scrollTo
    fireEvent.keyDown(track, { key: 'ArrowRight' })
    const selector = screen.getByRole('group', { name: 'Elegir cancha' })
    expect(
      within(selector).getByRole('button', { name: 'Cancha 1' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('tocar una píldora salta a esa cancha', () => {
    renderGrid()
    const track = screen.getByRole('group', { name: 'Canchas del día' })
    track.scrollTo = (() => {}) as unknown as typeof track.scrollTo
    const selector = screen.getByRole('group', { name: 'Elegir cancha' })
    fireEvent.click(within(selector).getByRole('button', { name: 'Cancha 2' }))
    expect(
      within(selector).getByRole('button', { name: 'Cancha 2' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(within(selector).getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })
})
