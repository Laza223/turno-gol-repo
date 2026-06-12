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

  it('el datepicker carga la fecha elegida y actualiza ?date= en la URL', async () => {
    const today = artToday()
    const target = addDays(today, 3)
    mockFetchOnce(availabilityFor(target, '20:00'), true)
    // happy-dom no propaga replaceState a location.search: espiamos la llamada.
    const replaceState = vi
      .spyOn(window.history, 'replaceState')
      .mockImplementation(() => undefined)

    render(
      <AvailabilityGrid
        tenant={tenant}
        initialDate={today}
        initialAvailability={availabilityFor(today, '18:00')}
      />,
    )

    fireEvent.change(screen.getByLabelText('Elegir fecha'), { target: { value: target } })

    await waitFor(() => {
      expect(screen.getByText(formatDateES(target))).toBeTruthy()
    })
    expect(screen.getByText('20:00')).toBeTruthy()
    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain(`date=${target}`)
    replaceState.mockRestore()
  })

  it('el filtro por cancha muestra solo la columna elegida y "Todas" la restaura', () => {
    const today = artToday()
    const availability: AvailabilityResponse = {
      date: today,
      courts: [
        {
          id: 'c1',
          name: 'Cancha 1',
          surfaceType: 'futbol5',
          slots: [{ time: '18:00', duration: 60, status: 'free', price: null }],
        },
        {
          id: 'c2',
          name: 'Cancha 2',
          surfaceType: 'futbol5',
          slots: [{ time: '19:00', duration: 60, status: 'free', price: null }],
        },
      ],
    }

    render(
      <AvailabilityGrid tenant={tenant} initialDate={today} initialAvailability={availability} />,
    )

    // Sin filtro: ambas columnas.
    expect(screen.getByRole('columnheader', { name: 'Cancha 1' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Cancha 2' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancha 2' }))
    expect(screen.queryByRole('columnheader', { name: 'Cancha 1' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Cancha 2' })).toBeTruthy()
    // El horario de la cancha filtrada desaparece de la grilla.
    expect(screen.queryByText('18:00')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(screen.getByRole('columnheader', { name: 'Cancha 1' })).toBeTruthy()
    expect(screen.getByText('18:00')).toBeTruthy()
  })

  it('muestra el precio en cada slot futuro, incluso ocupado o turno fijo', () => {
    const today = artToday()
    const availability: AvailabilityResponse = {
      date: today,
      courts: [
        {
          id: 'c1',
          name: 'Cancha 1',
          surfaceType: 'futbol5',
          slots: [
            { time: '18:00', duration: 60, status: 'free', price: 1500000 },
            { time: '19:00', duration: 60, status: 'occupied', price: 1500000 },
            { time: '20:00', duration: 60, status: 'fixed', price: 1800000 },
          ],
        },
      ],
    }

    render(
      <AvailabilityGrid tenant={tenant} initialDate={today} initialAvailability={availability} />,
    )

    expect(screen.getAllByText(/15\.000/)).toHaveLength(2) // libre + ocupado
    expect(screen.getAllByText(/18\.000/)).toHaveLength(1) // turno fijo
  })

  it('sin reserva online el slot libre ofrece Contactar con precio visible', () => {
    const today = artToday()
    const offlineTenant = { ...tenant, allowOnlineBooking: false } as PublicTenant
    const availability: AvailabilityResponse = {
      date: today,
      courts: [
        {
          id: 'c1',
          name: 'Cancha 1',
          surfaceType: 'futbol5',
          slots: [{ time: '18:00', duration: 60, status: 'free', price: 1200000 }],
        },
      ],
    }

    render(
      <AvailabilityGrid
        tenant={offlineTenant}
        initialDate={today}
        initialAvailability={availability}
      />,
    )

    expect(screen.getByText('Contactar')).toBeTruthy()
    expect(screen.getByText(/12\.000/)).toBeTruthy()
    expect(screen.queryByText('Reservar')).toBeNull()
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
