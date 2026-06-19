// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AvailabilityGrid from '@/app/(public)/[slug]/components/AvailabilityGrid'
import type {
  AvailabilityResponse,
  PublicTenant,
  SlotStatus,
} from '@/modules/tenants/public.service'

// La grilla es 100% client-side (la página del perfil es ISR): lee ?date= con
// useSearchParams y hace el fetch inicial en mount. Acá controlamos los params.
const { searchParamsRef } = vi.hoisted(() => ({
  searchParamsRef: { current: new URLSearchParams() },
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsRef.current,
}))

afterEach(() => {
  cleanup()
  searchParamsRef.current = new URLSearchParams()
})

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
        isCovered: false,
        hasLighting: true,
        slots: [{ time, duration: 60, status, price: null }],
      },
    ],
  }
}

// Respuestas en secuencia: la primera llamada es el fetch inicial de mount.
function mockFetchSequence(responses: Array<{ body: unknown; ok: boolean }>) {
  let call = 0
  const fn = vi.fn(async () => {
    const r = responses[Math.min(call, responses.length - 1)]!
    call += 1
    return new Response(JSON.stringify(r.body), {
      status: r.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  global.fetch = fn as unknown as typeof global.fetch
  return fn
}

describe('AvailabilityGrid (ISR: fetch inicial client-side)', () => {
  it('en mount pide la disponibilidad de hoy (ART) y la renderiza', async () => {
    const today = artToday()
    const fetchMock = mockFetchSequence([{ body: availabilityFor(today, '18:00'), ok: true }])

    render(<AvailabilityGrid tenant={tenant} />)

    await waitFor(() => {
      expect(screen.getByText(formatDateES(today))).toBeTruthy()
    })
    expect(screen.getByText('18:00')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability?slug=${encodeURIComponent(tenant.slug)}&date=${today}`,
    )
  })

  it('?date= válido dentro del rango se usa como fecha inicial', async () => {
    const today = artToday()
    const tomorrow = addDays(today, 1)
    searchParamsRef.current = new URLSearchParams({ date: tomorrow })
    const fetchMock = mockFetchSequence([{ body: availabilityFor(tomorrow, '19:00'), ok: true }])

    render(<AvailabilityGrid tenant={tenant} />)

    await waitFor(() => {
      expect(screen.getByText(formatDateES(tomorrow))).toBeTruthy()
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability?slug=${encodeURIComponent(tenant.slug)}&date=${tomorrow}`,
    )
  })

  it('?date= fuera del rango reservable se clampea a hoy', async () => {
    const today = artToday()
    // bookingAdvanceDays=6 → +30 días queda afuera del rango.
    searchParamsRef.current = new URLSearchParams({ date: addDays(today, 30) })
    const fetchMock = mockFetchSequence([{ body: availabilityFor(today, '18:00'), ok: true }])

    render(<AvailabilityGrid tenant={tenant} />)

    await waitFor(() => {
      expect(screen.getByText(formatDateES(today))).toBeTruthy()
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability?slug=${encodeURIComponent(tenant.slug)}&date=${today}`,
    )
  })
})

describe('AvailabilityGrid (#39)', () => {
  it('al fallar el fetch del día siguiente NO avanza la fecha y muestra un alerta', async () => {
    const today = artToday()
    mockFetchSequence([
      { body: availabilityFor(today, '18:00'), ok: true },
      { body: { error: 'boom' }, ok: false },
    ])

    render(<AvailabilityGrid tenant={tenant} />)

    // Estado inicial (tras el fetch de mount): etiqueta y slot del día de hoy.
    await waitFor(() => {
      expect(screen.getByText(formatDateES(today))).toBeTruthy()
    })
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
    mockFetchSequence([
      { body: availabilityFor(today, '18:00'), ok: true },
      { body: availabilityFor(tomorrow, '19:00'), ok: true },
    ])

    render(<AvailabilityGrid tenant={tenant} />)

    await waitFor(() => {
      expect(screen.getByText(formatDateES(today))).toBeTruthy()
    })

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
    mockFetchSequence([
      { body: availabilityFor(today, '18:00'), ok: true },
      { body: availabilityFor(target, '20:00'), ok: true },
    ])
    // happy-dom no propaga replaceState a location.search: espiamos la llamada.
    const replaceState = vi
      .spyOn(window.history, 'replaceState')
      .mockImplementation(() => undefined)

    render(<AvailabilityGrid tenant={tenant} />)

    await waitFor(() => {
      expect(screen.getByText(formatDateES(today))).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Elegir fecha'), { target: { value: target } })

    await waitFor(() => {
      expect(screen.getByText(formatDateES(target))).toBeTruthy()
    })
    expect(screen.getByText('20:00')).toBeTruthy()
    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain(`date=${target}`)
    replaceState.mockRestore()
  })

  it('el filtro por cancha muestra solo la columna elegida y "Todas" la restaura', async () => {
    const today = artToday()
    const availability: AvailabilityResponse = {
      date: today,
      courts: [
        {
          id: 'c1',
          name: 'Cancha 1',
          surfaceType: 'futbol5',
          isCovered: false,
          hasLighting: true,
          slots: [{ time: '18:00', duration: 60, status: 'free', price: null }],
        },
        {
          id: 'c2',
          name: 'Cancha 2',
          surfaceType: 'futbol5',
          isCovered: false,
          hasLighting: true,
          slots: [{ time: '19:00', duration: 60, status: 'free', price: null }],
        },
      ],
    }
    mockFetchSequence([{ body: availability, ok: true }])

    render(<AvailabilityGrid tenant={tenant} />)

    // Sin filtro: ambas columnas (tras el fetch de mount).
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Cancha 1' })).toBeTruthy()
    })
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

  it('muestra el precio en cada slot futuro, incluso ocupado o turno fijo', async () => {
    const today = artToday()
    const availability: AvailabilityResponse = {
      date: today,
      courts: [
        {
          id: 'c1',
          name: 'Cancha 1',
          surfaceType: 'futbol5',
          isCovered: false,
          hasLighting: true,
          slots: [
            { time: '18:00', duration: 60, status: 'free', price: 1500000 },
            { time: '19:00', duration: 60, status: 'occupied', price: 1500000 },
            { time: '20:00', duration: 60, status: 'fixed', price: 1800000 },
          ],
        },
      ],
    }
    mockFetchSequence([{ body: availability, ok: true }])

    render(<AvailabilityGrid tenant={tenant} />)

    await waitFor(() => {
      expect(screen.getAllByText(/15\.000/)).toHaveLength(2) // libre + ocupado
    })
    expect(screen.getAllByText(/18\.000/)).toHaveLength(1) // turno fijo
  })

  it('sin reserva online el slot libre ofrece Contactar con precio visible', async () => {
    const today = artToday()
    const offlineTenant = { ...tenant, allowOnlineBooking: false } as PublicTenant
    const availability: AvailabilityResponse = {
      date: today,
      courts: [
        {
          id: 'c1',
          name: 'Cancha 1',
          surfaceType: 'futbol5',
          isCovered: false,
          hasLighting: true,
          slots: [{ time: '18:00', duration: 60, status: 'free', price: 1200000 }],
        },
      ],
    }
    mockFetchSequence([{ body: availability, ok: true }])

    render(<AvailabilityGrid tenant={offlineTenant} />)

    await waitFor(() => {
      expect(screen.getByText('Contactar')).toBeTruthy()
    })
    expect(screen.getByText(/12\.000/)).toBeTruthy()
    expect(screen.queryByText('Reservar')).toBeNull()
  })

  it('renderiza etiquetas semánticas por estado: ocupado, turno fijo y bloqueado', async () => {
    const today = artToday()
    const availability: AvailabilityResponse = {
      date: today,
      courts: [
        {
          id: 'c1',
          name: 'Cancha 1',
          surfaceType: 'futbol5',
          isCovered: false,
          hasLighting: true,
          slots: [
            { time: '18:00', duration: 60, status: 'occupied', price: null },
            { time: '19:00', duration: 60, status: 'fixed', price: null },
            { time: '20:00', duration: 60, status: 'blocked', price: null },
            { time: '21:00', duration: 60, status: 'free', price: 1500000 },
          ],
        },
      ],
    }
    mockFetchSequence([{ body: availability, ok: true }])

    render(<AvailabilityGrid tenant={tenant} />)

    // Scope a la tabla: la leyenda repite los mismos textos fuera de ella.
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy()
    })
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ocupado')).toBeTruthy()
    expect(table.getByText('Turno fijo')).toBeTruthy()
    expect(table.getByText('Bloqueado')).toBeTruthy()
    expect(table.getByText('Reservar')).toBeTruthy()
  })
})
