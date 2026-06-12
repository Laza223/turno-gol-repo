// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AvailabilityGrid from '@/app/(public)/[slug]/components/AvailabilityGrid'
import type {
  AvailabilityResponse,
  PublicTenant,
  SlotStatus,
} from '@/modules/tenants/public.service'

afterEach(() => cleanup())

// Réplica de los helpers internos del componente para construir aserciones exactas.
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}
function formatDateES(dateStr: string): string {
  const dt = new Date(dateStr + 'T12:00:00Z')
  const s = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(dt)
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function artToday(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const tenant = {
  slug: 'cancha-x',
  phone: '+5491100000000',
  allowOnlineBooking: true,
  bookingAdvanceDays: 6,
} as unknown as PublicTenant

function availabilityFor(
  date: string,
  time: string,
  status: SlotStatus = 'occupied',
): AvailabilityResponse {
  return {
    date,
    courts: [
      {
        id: 'c1',
        name: 'Cancha 1',
        surfaceType: 'futbol5',
        slots: [{ time, duration: 60, status, price: null }],
      },
    ],
  }
}

function mockFetchOnce(body: unknown, ok: boolean) {
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: ok ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof global.fetch
}

describe('AvailabilityGrid (#39)', () => {
  it('al fallar el fetch del día siguiente NO avanza la fecha y muestra un alerta', async () => {
    const today = artToday()
    mockFetchOnce({ error: 'boom' }, false)

    render(
      <AvailabilityGrid
        tenant={tenant}
        initialDate={today}
        initialAvailability={availabilityFor(today, '18:00')}
      />,
    )

    // Estado inicial: etiqueta y slot del día de hoy.
    expect(screen.getByText(formatDateES(today))).toBeTruthy()
    expect(screen.getByText('18:00')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Día siguiente' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })

    // La etiqueta sigue en HOY (no avanzó a mañana) y los slots visibles también:
    // fecha y grilla quedan sincronizadas pese al error.
    expect(screen.getByText(formatDateES(today))).toBeTruthy()
    expect(screen.queryByText(formatDateES(addDays(today, 1)))).toBeNull()
    expect(screen.getByText('18:00')).toBeTruthy()
  })

  it('cuando el fetch tiene éxito avanza la fecha y actualiza los slots, sin alerta', async () => {
    const today = artToday()
    const tomorrow = addDays(today, 1)
    mockFetchOnce(availabilityFor(tomorrow, '19:00'), true)

    render(
      <AvailabilityGrid
        tenant={tenant}
        initialDate={today}
        initialAvailability={availabilityFor(today, '18:00')}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Día siguiente' }))

    await waitFor(() => {
      expect(screen.getByText(formatDateES(tomorrow))).toBeTruthy()
    })
    expect(screen.getByText('19:00')).toBeTruthy()
    expect(screen.queryByText('18:00')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renderiza etiquetas semánticas por estado: ocupado, turno fijo y bloqueado', () => {
    const today = artToday()
    const availability: AvailabilityResponse = {
      date: today,
      courts: [
        {
          id: 'c1',
          name: 'Cancha 1',
          surfaceType: 'futbol5',
          slots: [
            { time: '18:00', duration: 60, status: 'occupied', price: null },
            { time: '19:00', duration: 60, status: 'fixed', price: null },
            { time: '20:00', duration: 60, status: 'blocked', price: null },
            { time: '21:00', duration: 60, status: 'free', price: 1500000 },
          ],
        },
      ],
    }

    render(
      <AvailabilityGrid tenant={tenant} initialDate={today} initialAvailability={availability} />,
    )

    // Scope a la tabla: la leyenda repite los mismos textos fuera de ella.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ocupado')).toBeTruthy()
    expect(table.getByText('Turno fijo')).toBeTruthy()
    expect(table.getByText('Bloqueado')).toBeTruthy()
    expect(table.getByText('Reservar')).toBeTruthy()
  })
})
