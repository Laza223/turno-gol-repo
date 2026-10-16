// @vitest-environment happy-dom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ReserveSection from '@/app/(public)/[slug]/components/ReserveSection'
import { dayLong } from '@/app/(public)/[slug]/components/ChipGroups'
import { capitalizeFirst } from '@/lib/format'
import { addDays } from '@/shared/dates/art'
import type {
  AvailabilityResponse,
  PublicSlotStatus,
  PublicTenant,
  WeeklyAvailabilityResponse,
} from '@/modules/tenants/public.service'

// La reserva es 100% client-side (la página del perfil es ISR): lee ?date= con useSearchParams y
// pide el día en mount. Acá se controlan los params y el fetch.
const { searchParamsRef, trackMock } = vi.hoisted(() => ({
  searchParamsRef: { current: new URLSearchParams() },
  trackMock: vi.fn(async () => {}),
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParamsRef.current }))

const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
const tomorrow = addDays(today, 1)

let replaceState: MockInstance<History['replaceState']>
beforeEach(() => {
  sessionStorage.clear()
  trackMock.mockClear()
  // happy-dom no propaga replaceState a location.search: se espía la llamada.
  replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'visibilityState') // vuelve el getter del prototipo
  searchParamsRef.current = new URLSearchParams()
})

const DAY = { open: '08:00', close: '23:00' }
const baseTenant = {
  slug: 'cancha-x',
  name: 'Cancha X',
  phone: '+5491100000000',
  whatsapp: null,
  allowOnlineBooking: true,
  hidePrices: false,
  bookingAdvanceDays: 6,
  openingHours: { mon: DAY, tue: DAY, wed: DAY, thu: DAY, fri: DAY, sat: DAY, sun: DAY },
  closedDates: [] as string[],
  closesNextDay: false,
}
const tenantWith = (overrides: Partial<typeof baseTenant> = {}) =>
  ({ ...baseTenant, ...overrides }) as unknown as PublicTenant

type Court = AvailabilityResponse['courts'][number]
const slot = (time: string, status: PublicSlotStatus = 'free', price: number | null = null) => ({
  time,
  duration: 60,
  status,
  price,
})
const court = (id: string, name: string, slots: Court['slots'], format = 5): Court => ({
  id,
  name,
  surfaceType: 'synthetic_grass',
  isCovered: false,
  hasLighting: true,
  format,
  slots,
})
const dayOf = (date: string, courts: Court[]): AvailabilityResponse => ({ date, courts })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * `/api/public/availability?date=` → lo que devuelva `byDate` ('fail' = 500, un número = ese status);
 * `/week` → `week` (o lo que devuelva la función según el número de pedido; 'fail' = 500).
 */
type WeekReply = WeeklyAvailabilityResponse | 'fail'
function mockApi(
  byDate: (date: string, call: number) => AvailabilityResponse | 'fail' | number,
  week?: WeekReply | ((call: number) => WeekReply),
) {
  const calls: Record<string, number> = {}
  let weekCalls = 0
  const fn = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost')
    if (url.pathname.endsWith('/week')) {
      const reply =
        typeof week === 'function' ? week(++weekCalls) : (week ?? { startDate: '', days: [] })
      return reply === 'fail' ? json({ error: 'boom' }, 500) : json(reply)
    }
    const date = url.searchParams.get('date')!
    calls[date] = (calls[date] ?? 0) + 1
    const res = byDate(date, calls[date]!)
    // Los 400/404 de estas rutas responden `{ error: '<código>' }` (texto, no el envelope de errores).
    if (typeof res === 'number') {
      return json(
        { error: res === 400 ? 'date_out_of_range' : res === 404 ? 'not_found' : 'x' },
        res,
      )
    }
    return res === 'fail' ? json({ error: 'boom' }, 500) : json(res)
  })
  global.fetch = fn as unknown as typeof global.fetch
  return fn
}

const hourButtons = () =>
  within(screen.getByRole('radiogroup', { name: 'Hora' })).getAllByRole('radio')
const hour = (time: string) => screen.getByRole('radio', { name: new RegExp(`^${time}`) })
const dayChips = () => within(screen.getByRole('radiogroup', { name: 'Día' }))
const eveningCourt = (id: string, name: string, format = 5) =>
  court(id, name, [slot('18:00'), slot('19:00', 'occupied'), slot('21:00')], format)

describe('ReserveSection (ISR: todo se pide en el cliente)', () => {
  it('en mount pide el día de hoy (ART) con el fetch exacto y lo muestra', async () => {
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await screen.findByRole('radio', { name: /^18:00/ })
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability?slug=cancha-x&date=${today}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(dayChips().getByRole('radio', { name: /^Hoy/ }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('?date= válido dentro de la ventana es el día inicial', async () => {
    searchParamsRef.current = new URLSearchParams({ date: tomorrow })
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await screen.findByRole('radio', { name: /^18:00/ })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/public/availability?slug=cancha-x&date=${tomorrow}`,
    )
    expect(dayChips().getByRole('radio', { name: /^Hoy/ }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  it('?date= fuera de la ventana reservable vuelve a hoy', async () => {
    // bookingAdvanceDays = 6 → +30 días queda afuera.
    searchParamsRef.current = new URLSearchParams({ date: addDays(today, 30) })
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await screen.findByRole('radio', { name: /^18:00/ })
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/public/availability?slug=cancha-x&date=${today}`)
  })

  it('el turno de las 00:00 de un complejo que cierra a la 01:00 va DESPUÉS de las 23:00', async () => {
    // Orden tal cual lo emite el server (eje continuo del día operativo): ordenar por la
    // etiqueta mandaba la madrugada arriba de todo.
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('22:00'), slot('23:00'), slot('00:00')]),
        court('c2', 'Cancha 2', [slot('22:00'), slot('23:00'), slot('00:00')]),
      ]),
    )

    render(
      <ReserveSection
        tenant={tenantWith({ closesNextDay: true })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )

    await screen.findByRole('radio', { name: /^00:00/ })
    expect(hourButtons().map((r) => r.textContent!.slice(0, 5))).toEqual([
      '22:00',
      '23:00',
      '00:00',
    ])
  })

  it('al fallar el pedido avisa con un alerta, conserva el día elegido y Reintentar lo recupera', async () => {
    mockApi((date, call) => (call === 1 ? 'fail' : dayOf(date, [eveningCourt('c1', 'Cancha 1')])))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('No pudimos cargar los horarios del')
    expect(dayChips().getByRole('radio', { name: /^Hoy/ }).getAttribute('aria-checked')).toBe(
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await screen.findByRole('radio', { name: /^18:00/ })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('una hora con alguien señando se ve "Señando", no se elige y explica que puede liberarse', async () => {
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00'), slot('20:00', 'held')]),
        court('c2', 'Cancha 2', [slot('18:00'), slot('20:00', 'occupied')]),
      ]),
    )

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    const held = await screen.findByRole('radio', { name: /^20:00/ })
    expect(held.textContent).toContain('Señando')
    expect(held.hasAttribute('disabled')).toBe(true)
    // La ayuda es texto visible (no un `title`) y el botón la referencia.
    const help = document.getElementById(held.getAttribute('aria-describedby')!)
    expect(help?.textContent).toMatch(/alguien está pagando la seña/)
  })

  it('las horas que ya pasaron no se muestran; si pasaron todas, lo dice', async () => {
    mockApi((date) =>
      dayOf(date, [court('c1', 'Cancha 1', [slot('09:00', 'past'), slot('20:00')])]),
    )
    const first = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await screen.findByRole('radio', { name: /^20:00/ })
    expect(screen.queryByRole('radio', { name: /^09:00/ })).toBeNull()
    first.unmount()

    mockApi((date) => dayOf(date, [court('c1', 'Cancha 1', [slot('09:00', 'past')])]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    expect((await screen.findByText(/^No quedan horarios el/)).textContent).toContain(
      dayLong(today),
    )
    expect(screen.queryByRole('radiogroup', { name: 'Hora' })).toBeNull()
  })
})

describe('ReserveSection: hora → cancha', () => {
  it('elegir una hora lista las canchas libres a esa hora con link a confirmar', async () => {
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('21:00', 'free', 1500000)]),
        court('c2', 'Cancha 2', [slot('21:00', 'occupied')], 7),
        court('c3', 'Cancha 3', [slot('21:00', 'free', 1800000)], 7),
      ]),
    )

    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    fireEvent.click(await screen.findByRole('radio', { name: /^21:00/ }))

    const list = within(screen.getByRole('region', { name: 'Canchas libres a las 21:00' }))
    const links = list.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      `/cancha-x/reservar?court=c1&date=${today}&time=21:00&dur=60`,
      `/cancha-x/reservar?court=c3&date=${today}&time=21:00&dur=60`,
    ])
    expect(links[1]!.textContent).toContain('Cancha 3')
    expect(links[1]!.textContent).toContain('Fútbol 7')
    expect(links[1]!.textContent).toContain('18.000')
    expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.stringContaining('hora=21%3A00'))
  })

  it.each([1, 3, 5, 10, 16])('con %i cancha(s) libres a la hora, las lista todas', async (n) => {
    mockApi((date) =>
      dayOf(
        date,
        Array.from({ length: n }, (_, i) => court(`c${i}`, `Cancha ${i + 1}`, [slot('21:00')])),
      ),
    )

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await screen.findByRole('radio', { name: /^21:00/ }))

    const region = screen.getByRole('region', { name: 'Canchas libres a las 21:00' })
    expect(within(region).getAllByRole('link')).toHaveLength(n)
  })

  it('?hora= que no existe (o está completa) no elige nada; una válida se elige sola', async () => {
    searchParamsRef.current = new URLSearchParams({ hora: '03:00' })
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    const first = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await screen.findByRole('radio', { name: /^18:00/ })
    expect(screen.queryByText(/^Canchas libres a las/)).toBeNull()
    first.unmount()

    // 19:00 existe pero está completa.
    searchParamsRef.current = new URLSearchParams({ hora: '19:00' })
    const second = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await screen.findByRole('radio', { name: /^18:00/ })
    expect(screen.queryByText(/^Canchas libres a las/)).toBeNull()
    second.unmount()

    searchParamsRef.current = new URLSearchParams({ hora: '18:00' })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    expect(await screen.findByText('Canchas libres a las 18:00')).toBeTruthy()
    expect(hour('18:00').getAttribute('aria-checked')).toBe('true')
  })

  it('sin reserva online cada cancha abre WhatsApp con el pedido escrito', async () => {
    mockApi((date) => dayOf(date, [court('c1', 'Cancha 1', [slot('21:00', 'free', 1200000)])]))

    render(
      <ReserveSection
        tenant={tenantWith({ allowOnlineBooking: false })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    fireEvent.click(await screen.findByRole('radio', { name: /^21:00/ }))

    const link = within(
      screen.getByRole('region', { name: 'Canchas libres a las 21:00' }),
    ).getByRole('link')
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//)
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain(
      'a las 21:00 (Cancha 1, Fútbol 5).',
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.textContent).toContain('WhatsApp')
    expect(link.getAttribute('href')).not.toContain('/reservar')
  })

  it('el filtro de formato deja solo las horas de ese formato, sin volver a pedir el día', async () => {
    const fetchMock = mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00')], 5),
        court('c2', 'Cancha 2', [slot('19:00')], 7),
      ]),
    )

    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^19:00/ })
    expect(hourButtons()).toHaveLength(2)

    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))

    await waitFor(() => expect(hourButtons()).toHaveLength(1))
    expect(hourButtons()[0]!.textContent).toContain('19:00')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.stringContaining('formato=7'))

    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }))
    await waitFor(() => expect(hourButtons()).toHaveLength(2))
  })

  it('con un solo formato no hay filtro de formato', async () => {
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^18:00/ })
    expect(screen.queryByRole('radiogroup', { name: 'Formato' })).toBeNull()
  })
})

describe('ReserveSection: precios ocultos (hidePrices)', () => {
  // El servidor ya manda `price: null` con hidePrices; acá se FUERZA un precio para probar la
  // segunda llave de CourtRows: ningún monto sale aunque el dato llegue.
  const priced = (date: string) =>
    dayOf(date, [
      court('c1', 'Cancha 1', [slot('21:00', 'free', 1500000)]),
      court('c2', 'Cancha 2', [slot('21:00', 'free', 1800000)]),
    ])

  it('no hay ningún $ en el texto ni en un aria-label, ni con la lista abierta', async () => {
    mockApi(priced)

    render(
      <ReserveSection
        tenant={tenantWith({ hidePrices: true })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    fireEvent.click(await screen.findByRole('radio', { name: /^21:00/ }))
    await screen.findByText('Canchas libres a las 21:00')

    expect(document.body.textContent).not.toContain('$')
    expect(document.body.textContent).not.toMatch(/15\.000|18\.000/)
    const labels = [...document.querySelectorAll('[aria-label]')].map((el) =>
      el.getAttribute('aria-label'),
    )
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.filter((label) => label!.includes('$'))).toEqual([])
  })

  it('control: con los precios visibles el monto sale en la fila', async () => {
    mockApi(priced)

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await screen.findByRole('radio', { name: /^21:00/ }))

    const region = await screen.findByRole('region', { name: 'Canchas libres a las 21:00' })
    expect(region.textContent).toContain('15.000')
  })
})

describe('ReserveSection: días sin lugar', () => {
  it('un día cerrado se ve deshabilitado y su estado ofrece el próximo día abierto', async () => {
    searchParamsRef.current = new URLSearchParams({ date: tomorrow })
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(
      <ReserveSection
        tenant={tenantWith({ closedDates: [tomorrow] })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )

    const chip = dayChips().getAllByRole('radio')[1]!
    expect(chip.hasAttribute('disabled')).toBe(true)
    expect(chip.textContent).toContain('Cerrado')
    expect((await screen.findByText(/^Cerrado el/)).textContent).toContain(dayLong(tomorrow))
    // El día cerrado no pide horas.
    expect(fetchMock).not.toHaveBeenCalled()

    const dayAfter = addDays(today, 2)
    fireEvent.click(screen.getByRole('button', { name: `Ver el ${dayLong(dayAfter)}` }))

    await screen.findByRole('radio', { name: /^18:00/ })
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability?slug=cancha-x&date=${dayAfter}`,
      expect.anything(),
    )
  })

  it('con el día completo ofrece el próximo día con lugar (una consulta a la semana)', async () => {
    const full = dayOf(today, [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])])
    const week: WeeklyAvailabilityResponse = {
      startDate: tomorrow,
      days: [
        { date: tomorrow, courts: [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])] },
        { date: addDays(today, 2), courts: [court('c1', 'Cancha 1', [slot('18:00')])] },
      ],
    }
    const fetchMock = mockApi((date) => ({ ...full, date }), week)

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    const button = await screen.findByRole('button', {
      name: `Ver el ${dayLong(addDays(today, 2))}`,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability/week?slug=cancha-x&start=${tomorrow}`,
      expect.anything(),
    )
    // Con otro día al que ir, nueve "Completo" no dicen más que el título: no hay grilla.
    expect(screen.queryByRole('radiogroup', { name: 'Hora' })).toBeNull()
    fireEvent.click(button)
    await waitFor(() =>
      expect(dayChips().getAllByRole('radio')[2]!.getAttribute('aria-checked')).toBe('true'),
    )
  })

  it('si en la ventana no queda lugar en ningún día, lo dice y ofrece hablar con el complejo', async () => {
    const full = (date: string) =>
      dayOf(date, [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])])
    // La ventana de 6 días deja 6 días por revisar después de hoy: el texto dice el número real.
    mockApi(full, {
      startDate: tomorrow,
      days: Array.from({ length: 6 }, (_, i) => {
        const date = addDays(tomorrow, i)
        return { date, courts: full(date).courts }
      }),
    })

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect(await screen.findByText('No hay lugar en los próximos 6 días.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Consultar por WhatsApp' })).toBeTruthy()
  })

  it('un complejo sin canchas lo dice y ofrece contacto', async () => {
    mockApi((date) => dayOf(date, []))

    render(<ReserveSection tenant={tenantWith()} formats={[]} trackViewed={trackMock} />)

    expect(
      await screen.findByText('Este complejo todavía no tiene canchas para reservar'),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Consultar por WhatsApp' })).toBeTruthy()
  })
})

describe('ReserveSection: anuncio y métrica', () => {
  it('un role=status oculto anuncia el día y, al elegir hora, las canchas libres', async () => {
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00'), slot('21:00')], 5),
        court('c2', 'Cancha 2', [slot('21:00')], 5),
      ]),
    )

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^21:00/ })

    const status = screen.getByRole('status')
    expect(status.className).toContain('sr-only')
    expect(status.textContent).toBe(`${capitalizeFirst(dayLong(today))}: 2 horarios con lugar`)

    fireEvent.click(hour('21:00'))
    expect(status.textContent).toBe('21:00: 2 canchas libres')

    fireEvent.click(hour('18:00'))
    expect(status.textContent).toBe('18:00: 1 cancha libre')
  })

  it('profile.viewed sale una vez por pestaña y complejo, tras la primera carga de horas', async () => {
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    const first = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await waitFor(() => expect(trackMock).toHaveBeenCalledTimes(1))
    expect(trackMock).toHaveBeenCalledWith('cancha-x', false)

    // Cambiar de día y volver a montar en la misma pestaña no repite el evento.
    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    await screen.findByRole('radio', { name: /^18:00/ })
    first.unmount()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^18:00/ })
    expect(trackMock).toHaveBeenCalledTimes(1)
  })

  it('profile.viewed avisa si la URL traía ?date=', async () => {
    searchParamsRef.current = new URLSearchParams({ date: tomorrow })
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await waitFor(() => expect(trackMock).toHaveBeenCalledWith('cancha-x', true))
  })

  it('profile.viewed no sale si las horas no cargaron', async () => {
    mockApi(() => 'fail')
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('alert')
    expect(trackMock).not.toHaveBeenCalled()
  })
})

describe('ReserveSection: refresco con "Señando"', () => {
  const heldDay = (date: string) =>
    dayOf(date, [court('c1', 'Cancha 1', [slot('18:00', 'free'), slot('20:00', 'held')])])
  const freeDay = (date: string) => dayOf(date, [court('c1', 'Cancha 1', [slot('18:00')])])

  async function timersWith(byDate: (date: string) => AvailabilityResponse) {
    const fetchMock = mockApi(byDate)
    const view = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await screen.findByRole('radio', { name: /^18:00/ })
    const timers = vi.getTimerCount()
    return { fetchMock, timers, view }
  }

  it('solo hay intervalo de 30 s si alguna hora está "Señando", y vuelve a pedir el día', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    const free = await timersWith(freeDay)
    free.view.unmount()
    const held = await timersWith(heldDay)

    expect(held.timers).toBe(free.timers + 1)
    expect(held.fetchMock).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(held.fetchMock).toHaveBeenCalledTimes(2)
  })
})

// ─── Guardas de la ronda 2: cada una tiene su control negativo (ver el reporte) ───────────────

const heldDay = (date: string) =>
  dayOf(date, [court('c1', 'Cancha 1', [slot('18:00'), slot('20:00', 'held')])])
const freeDay = (date: string) => dayOf(date, [court('c1', 'Cancha 1', [slot('18:00')])])
const fetched = (fetchMock: { mock: { calls: unknown[][] } }, date: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(`date=${date}`)).length

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Un fetch que no responde solo: cada pedido queda pendiente hasta que el test lo resuelva o lo aborten. */
function pendingFetch() {
  const calls: {
    url: string
    signal: AbortSignal
    resolve: (body: unknown, status?: number) => void
  }[] = []
  global.fetch = vi.fn(
    (url: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((resolve, reject) => {
        calls.push({
          url,
          signal: init.signal,
          resolve: (body, status) => resolve(json(body, status)),
        })
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      }),
  ) as unknown as typeof global.fetch
  return calls
}

describe('ReserveSection: refresco, abortos y limpieza', () => {
  it('con la pestaña oculta no se refresca el día "Señando"; al volver, sí', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    setVisibility('hidden')
    const fetchMock = mockApi(heldDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^18:00/ })

    await act(() => vi.advanceTimersByTimeAsync(90_000))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => setVisibility('visible'))
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('cambiar de día aborta el pedido pendiente y desmontar aborta el del día nuevo', async () => {
    const calls = pendingFetch()
    const view = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await waitFor(() => expect(calls).toHaveLength(1))

    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[0]!.signal.aborted).toBe(true)
    expect(calls[1]!.signal.aborted).toBe(false)

    view.unmount()
    expect(calls[1]!.signal.aborted).toBe(true)
  })

  it('el refresco de "Señando" aborta el anterior si sigue pendiente y se aborta al desmontar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const calls = pendingFetch()
    const view = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => calls[0]!.resolve(heldDay(today)))
    await screen.findByRole('radio', { name: /^18:00/ })

    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(calls).toHaveLength(2)
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(calls).toHaveLength(3)
    expect(calls[1]!.signal.aborted).toBe(true)
    expect(calls[2]!.signal.aborted).toBe(false)

    view.unmount()
    expect(calls[2]!.signal.aborted).toBe(true)
  })

  it('un pedido abortado no cuenta como fallo: no parpadea el error al re-pedir el mismo día', async () => {
    // StrictMode monta, desmonta y vuelve a montar: el primer pedido se aborta y rechaza con
    // AbortError mientras el segundo sigue pendiente. Sin la guarda `aborted` ese rechazo quedaba
    // como un fallo de red y tapaba las horas con un alerta.
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />, {
      wrapper: StrictMode,
    })
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2))
    await act(async () => {})
    expect(calls[0]!.signal.aborted).toBe(true)
    expect(calls.at(-1)!.signal.aborted).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()

    await act(async () => calls.at(-1)!.resolve(freeDay(today)))
    expect(await screen.findByRole('radio', { name: /^18:00/ })).toBeTruthy()
  })

  it('sin datos, mostrar y ocultar la pestaña no reinicia el pedido en vuelo', async () => {
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(calls).toHaveLength(1))

    for (let i = 0; i < 10; i++) {
      await act(async () => setVisibility(i % 2 === 0 ? 'hidden' : 'visible'))
    }

    expect(calls).toHaveLength(1)
    expect(calls[0]!.signal.aborted).toBe(false)
    await act(async () => calls[0]!.resolve(freeDay(today)))
    expect(await screen.findByRole('radio', { name: /^18:00/ })).toBeTruthy()
  })

  it('con datos vencidos, cada vuelta a la pestaña hace a lo sumo un pedido', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => calls[0]!.resolve(freeDay(today)))
    await screen.findByRole('radio', { name: /^18:00/ })

    vi.setSystemTime(Date.now() + 130_000)
    for (let back = 1; back <= 3; back++) {
      await act(async () => setVisibility('hidden'))
      expect(calls).toHaveLength(back) // oculta no pide nada
      await act(async () => setVisibility('visible'))
      expect(calls).toHaveLength(back + 1) // una por vuelta, no una por evento
    }
  })

  it('no queda ningún intervalo al dejar de estar "Señando" ni al desmontar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const base = vi.getTimerCount()
    const fetchMock = mockApi((date, call) => (call === 1 ? heldDay(date) : freeDay(date)))
    const view = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await screen.findByRole('radio', { name: /^18:00/ })
    const whileHeld = vi.getTimerCount()

    await act(() => vi.advanceTimersByTimeAsync(30_000)) // la respuesta ya no trae "Señando"
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(whileHeld - 1)
    await act(() => vi.advanceTimersByTimeAsync(120_000))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    view.unmount()
    expect(vi.getTimerCount()).toBe(base)
  })

  it('desmontar con el intervalo corriendo lo limpia', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const base = vi.getTimerCount()
    mockApi(heldDay)
    const view = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await screen.findByRole('radio', { name: /^18:00/ })
    expect(vi.getTimerCount()).toBeGreaterThan(base)

    view.unmount()
    expect(vi.getTimerCount()).toBe(base)
  })
})

describe('ReserveSection: datos vencidos', () => {
  async function onTodayThenTomorrow() {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const fetchMock = mockApi(freeDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^18:00/ })
    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    await waitFor(() => expect(fetched(fetchMock, tomorrow)).toBe(1))
    return fetchMock
  }

  it('volver a un día visto hace menos de 120 s no pide nada; vencido, lo muestra y lo vuelve a pedir', async () => {
    const fetchMock = await onTodayThenTomorrow()

    vi.setSystemTime(Date.now() + 100_000)
    fireEvent.click(dayChips().getAllByRole('radio')[0]!)
    await act(async () => {})
    expect(fetched(fetchMock, today)).toBe(1)

    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    vi.setSystemTime(Date.now() + 130_000)
    fireEvent.click(dayChips().getAllByRole('radio')[0]!)
    // Lo vencido se sigue viendo mientras llega lo nuevo: sin esqueleto ni salto.
    expect(screen.getByRole('radio', { name: /^18:00/ })).toBeTruthy()
    await waitFor(() => expect(fetched(fetchMock, today)).toBe(2))
  })

  it('al volver a la pestaña un día vencido se vuelve a pedir; oculta, no', async () => {
    const fetchMock = await onTodayThenTomorrow()
    vi.setSystemTime(Date.now() + 130_000)

    await act(async () => setVisibility('hidden'))
    expect(fetched(fetchMock, tomorrow)).toBe(1)

    await act(async () => setVisibility('visible'))
    await waitFor(() => expect(fetched(fetchMock, tomorrow)).toBe(2))
  })

  it('pasada la medianoche, el día elegido con un chip que ya pasó vuelve a hoy', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const fetchMock = mockApi(freeDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^18:00/ })
    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    await waitFor(() => expect(fetched(fetchMock, tomorrow)).toBe(1))

    // Dos días después `tomorrow` ya es pasado: el reloj de la app avisa en el próximo minuto.
    vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000)
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    const newToday = addDays(today, 2)
    await waitFor(() => expect(fetched(fetchMock, newToday)).toBe(1))
    expect(dayChips().getByRole('radio', { name: /^Hoy/ }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })
})

describe('ReserveSection: por qué no cargó', () => {
  async function alertFor(byDate: Parameters<typeof mockApi>[0]) {
    mockApi(byDate)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    return (await screen.findByRole('alert')).textContent ?? ''
  }

  it('429: pide esperar unos segundos, no revisar la conexión, y deja reintentar', async () => {
    const text = await alertFor(() => 429)
    expect(text).toContain('demasiadas consultas')
    expect(text).toContain('Esperá unos segundos')
    expect(text).not.toContain('conexión')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })

  it('404: dice que el complejo no está disponible y ofrece salir, sin reintentar', async () => {
    const text = await alertFor(() => 404)
    expect(text).toContain('Este complejo no está disponible')
    expect(text).toContain('No se puede reservar acá por ahora.')
    expect(screen.getByRole('link', { name: 'Buscar otro complejo' }).getAttribute('href')).toBe(
      '/explorar',
    )
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('error del servidor: lo dice de nuestro lado, no de la conexión del visitante', async () => {
    const text = await alertFor(() => 'fail')
    expect(text).toContain('de nuestro lado')
    expect(text).not.toContain('conexión')
  })

  it('sin respuesta (red): sigue pidiendo revisar la conexión', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof global.fetch
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Revisá tu conexión')
  })

  it('volver a un día que había fallado no muestra el error mientras reintenta', async () => {
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => calls[0]!.resolve({ error: 'boom' }, 500))
    await screen.findByRole('alert')

    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => calls[1]!.resolve(freeDay(tomorrow)))
    await screen.findByRole('radio', { name: /^18:00/ })

    fireEvent.click(dayChips().getAllByRole('radio')[0]!)
    await waitFor(() => expect(calls).toHaveLength(3))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ReserveSection: la búsqueda de otro día', () => {
  const fullDay = (date: string) =>
    dayOf(date, [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])])
  const roomDay = addDays(today, 2)
  const week = (): WeeklyAvailabilityResponse => ({
    startDate: tomorrow,
    days: [{ date: roomDay, courts: [court('c1', 'Cancha 1', [slot('18:00')])] }],
  })

  it('si la búsqueda falla no afirma que no hay lugar: lo dice y deja reintentar', async () => {
    mockApi(fullDay, (call) => (call === 1 ? 'fail' : week()))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect(await screen.findByText('No pudimos buscar otro día.')).toBeTruthy()
    expect(screen.queryByText(/No hay lugar/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('button', { name: `Ver el ${dayLong(roomDay)}` })).toBeTruthy()
  })

  it('el último día reservable no revisa nada y no dice que miró los próximos días', async () => {
    searchParamsRef.current = new URLSearchParams({ date: addDays(today, 6) })
    const fetchMock = mockApi(fullDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect(await screen.findByText('Es el último día para reservar.')).toBeTruthy()
    expect(screen.queryByText(/próximos/)).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/week'))).toBe(false)
  })
})

describe('ReserveSection: una sola cancha, estado de la reserva y avisos', () => {
  it('con una sola cancha la hora libre es "Libre", sin ámbar; con dos queda "Queda 1"', async () => {
    mockApi((date) => dayOf(date, [court('c1', 'Cancha 1', [slot('18:00')])]))
    const one = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    const alone = await screen.findByRole('radio', { name: /^18:00/ })
    expect(alone.textContent).toContain('Libre')
    expect(alone.textContent).not.toContain('Queda 1')
    expect(alone.className).not.toContain('warning')
    one.unmount()

    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00')]),
        court('c2', 'Cancha 2', [slot('18:00', 'occupied')]),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    const scarce = await screen.findByRole('radio', { name: /^18:00/ })
    expect(scarce.textContent).toContain('Queda 1')
    expect(scarce.className).toContain('bg-warning')
  })

  it('"Señando" no usa ámbar: borde punteado y texto normal', async () => {
    mockApi(heldDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    const held = await screen.findByRole('radio', { name: /^20:00/ })
    expect(held.className).toContain('border-dotted')
    expect(held.className).not.toContain('warning')
  })

  it('data-state: loading → ready, closed, error', async () => {
    const region = () => screen.getByRole('region', { name: 'Reservá tu turno' })
    mockApi(freeDay)
    const ready = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    expect(region().getAttribute('data-state')).toBe('loading')
    await screen.findByRole('radio', { name: /^18:00/ })
    expect(region().getAttribute('data-state')).toBe('ready')
    ready.unmount()

    const closed = render(
      <ReserveSection
        tenant={tenantWith({ closedDates: [today] })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    await waitFor(() => expect(region().getAttribute('data-state')).toBe('closed'))
    closed.unmount()

    mockApi(() => 'fail')
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(region().getAttribute('data-state')).toBe('error'))
  })

  it('sin anticipación, la pista dice que se reserva solo para hoy', async () => {
    mockApi(freeDay)
    render(
      <ReserveSection
        tenant={tenantWith({ bookingAdvanceDays: 0 })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    expect(await screen.findByText('Reservás solo para hoy')).toBeTruthy()
    expect(screen.queryByText(/0 días/)).toBeNull()
  })

  it('profile.viewed también sale si el primer día cargado está cerrado', async () => {
    const fetchMock = mockApi(freeDay)
    render(
      <ReserveSection
        tenant={tenantWith({ closedDates: [today] })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    await waitFor(() => expect(trackMock).toHaveBeenCalledWith('cancha-x', false))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un sessionStorage que tira error no rompe la página y el evento sale igual', async () => {
    // Modo privado estricto: tocar `sessionStorage` tira. Se reemplaza el global entero (un spy
    // sobre `Storage.prototype` no alcanza a happy-dom y el test pasaría sin probar nada).
    const denied = () => {
      throw new Error('storage denegado')
    }
    vi.stubGlobal('sessionStorage', { getItem: denied, setItem: denied })
    mockApi(freeDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect(await screen.findByRole('radio', { name: /^18:00/ })).toBeTruthy()
    await waitFor(() => expect(trackMock).toHaveBeenCalledTimes(1))
  })
})

describe('ReserveSection: acercar la lista de canchas', () => {
  const scroll = vi.fn()
  const originalScroll = Element.prototype.scrollIntoView
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScroll
  })
  const reduceMotion = (matches: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches }) as MediaQueryList)

  beforeEach(() => {
    scroll.mockClear()
    Element.prototype.scrollIntoView = scroll
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
  })

  it('al elegir una hora la lista se acerca lo justo y con animación', async () => {
    reduceMotion(false)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await screen.findByRole('radio', { name: /^21:00/ }))

    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
  })

  it('con "reducir movimiento" se acerca sin animación', async () => {
    reduceMotion(true)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await screen.findByRole('radio', { name: /^21:00/ }))

    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' })
  })

  it('una hora que ya viene en la URL no mueve la página al cargar', async () => {
    reduceMotion(false)
    searchParamsRef.current = new URLSearchParams({ hora: '21:00' })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await screen.findByText('Canchas libres a las 21:00')
    expect(scroll).not.toHaveBeenCalled()
  })
})

describe('ReserveSection: ronda 3 — frescura, día fuera de ventana y hora ocupada', () => {
  const expired = () => vi.setSystemTime(Date.now() + 130_000)

  it('un refresco que falla no tapa las horas que ya se ven', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const fetchMock = mockApi((date, call) => (call === 1 ? freeDay(date) : 'fail'))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^18:00/ })
    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    await waitFor(() => expect(fetched(fetchMock, tomorrow)).toBe(1))
    expired()

    fireEvent.click(dayChips().getAllByRole('radio')[0]!)
    await waitFor(() => expect(fetched(fetchMock, today)).toBe(2)) // el refresco falló
    await act(async () => {})

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('radio', { name: /^18:00/ })).toBeTruthy()
  })

  it('elegir una hora con el día vencido lo vuelve a pedir; con datos frescos, no', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await screen.findByRole('radio', { name: /^18:00/ }))
    await act(async () => {})
    expect(fetched(fetchMock, today)).toBe(1)

    expired()
    fireEvent.click(hour('21:00'))
    await waitFor(() => expect(fetched(fetchMock, today)).toBe(2))
  })

  it('si la hora elegida se ocupa en el refresco, lo dice en lugar de la lista y lo anuncia', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    mockApi((date, call) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00'), slot('21:00', call === 1 ? 'free' : 'occupied')]),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^21:00/ })
    expired()

    fireEvent.click(hour('21:00'))
    const message = 'Las 21:00 se ocuparon. Elegí otra hora.'
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(2))

    expect(screen.getByRole('status').textContent).toBe(message)
    expect(screen.queryByRole('region', { name: /^Canchas libres/ })).toBeNull()
    expect(hour('18:00').getAttribute('aria-checked')).toBe('false')
  })

  it('sin hora elegida antes (URL con una hora que no existe o completa) no dice "se ocuparon"', async () => {
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    for (const hora of ['03:00', '19:00']) {
      searchParamsRef.current = new URLSearchParams({ hora })
      const view = render(
        <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
      )
      await screen.findByRole('radio', { name: /^18:00/ })
      expect(screen.queryByText(/se ocuparon/)).toBeNull()
      view.unmount()
    }
  })

  it('si la hora desaparece porque cambió el filtro de formato, no dice que se ocupó', async () => {
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00')], 5),
        court('c2', 'Cancha 2', [slot('19:00')], 7),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    fireEvent.click(await screen.findByRole('radio', { name: /^18:00/ }))
    await screen.findByRole('region', { name: 'Canchas libres a las 18:00' })

    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))
    await waitFor(() => expect(hourButtons()).toHaveLength(1))

    expect(screen.queryByText(/se ocuparon/)).toBeNull()
  })

  it('la semana de "otro día con lugar" también vale 120 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const fullDay = (date: string) =>
      dayOf(date, [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])])
    const fetchMock = mockApi(fullDay, () => ({ startDate: tomorrow, days: [] }))
    const weekCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/week')).length
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(weekCalls()).toBe(1))
    fireEvent.click(dayChips().getAllByRole('radio')[1]!) // otro día completo: otra semana
    await waitFor(() => expect(weekCalls()).toBe(2))

    vi.setSystemTime(Date.now() + 100_000)
    fireEvent.click(dayChips().getAllByRole('radio')[0]!)
    await act(async () => {})
    expect(weekCalls()).toBe(2) // 100 s: sigue valiendo

    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    vi.setSystemTime(Date.now() + 30_000)
    fireEvent.click(dayChips().getAllByRole('radio')[0]!)
    await waitFor(() => expect(weekCalls()).toBe(3)) // 130 s: venció
  })

  it('cambiar de día con la búsqueda en vuelo no deja un error guardado para ese día', async () => {
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () =>
      calls[0]!.resolve(dayOf(today, [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])])),
    )
    const weekCalls = () => calls.filter((c) => c.url.includes('/week'))
    await waitFor(() => expect(weekCalls()).toHaveLength(1))

    // Irse a otro día aborta la búsqueda en vuelo; ese rechazo no es un fallo de la búsqueda.
    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    await waitFor(() => expect(weekCalls()[0]!.signal.aborted).toBe(true))
    await act(async () => {})

    fireEvent.click(dayChips().getAllByRole('radio')[0]!)
    await waitFor(() => expect(weekCalls()).toHaveLength(2)) // se vuelve a buscar
    expect(screen.queryByText('No pudimos buscar otro día.')).toBeNull()
  })

  it('400 date_out_of_range: dice que ese día ya no se puede reservar y ofrece "Ver hoy", sin reintentar', async () => {
    mockApi((date) => (date === today ? freeDay(date) : 400))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^18:00/ })
    fireEvent.click(dayChips().getAllByRole('radio')[1]!)

    const text = (await screen.findByRole('alert')).textContent ?? ''
    expect(text).toContain('Ese día ya no se puede reservar')
    expect(text).not.toContain('de nuestro lado')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ver hoy' }))
    expect(await screen.findByRole('radio', { name: /^18:00/ })).toBeTruthy()
    expect(dayChips().getByRole('radio', { name: /^Hoy/ }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      expect.stringContaining(`date=${today}`),
    )
  })

  it('un 400 que no es de fecha (invalid_params) sigue siendo un fallo del servidor', async () => {
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => calls[0]!.resolve({ error: 'invalid_params' }, 400))

    expect((await screen.findByRole('alert')).textContent).toContain('de nuestro lado')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ver hoy' })).toBeNull()
  })

  it('pasada la medianoche, la hora y el formato del chip que pasó no se heredan al día nuevo', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    // La URL (que el navegador ya había actualizado) también trae hora y formato: tampoco mandan,
    // y se borran de la barra de direcciones junto con el cambio de día (lo demás se conserva).
    searchParamsRef.current = new URLSearchParams({ hora: '18:00' })
    const happyDom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM
    happyDom.setURL('http://localhost:3000/cancha-x?hora=18%3A00&formato=7&utm=x')
    const fetchMock = mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00'), slot('21:00')], 5),
        court('c2', 'Cancha 2', [slot('18:00'), slot('21:00')], 7),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await screen.findByRole('radio', { name: /^21:00/ })
    fireEvent.click(dayChips().getAllByRole('radio')[1]!)
    await waitFor(() => expect(fetched(fetchMock, tomorrow)).toBe(1))
    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))
    fireEvent.click(await screen.findByRole('radio', { name: /^21:00/ }))
    expect(screen.getByRole('region', { name: 'Canchas libres a las 21:00' })).toBeTruthy()

    vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000)
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    const newToday = addDays(today, 2)
    await waitFor(() => expect(fetched(fetchMock, newToday)).toBe(1))
    await screen.findByRole('radio', { name: /^21:00/ })

    expect(screen.queryByText(/^Canchas libres a las/)).toBeNull()
    expect(hourButtons().every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(screen.getByRole('radio', { name: 'Todos' }).getAttribute('aria-checked')).toBe('true')
    expect(replaceState).toHaveBeenLastCalledWith(null, '', `/cancha-x?utm=x&date=${newToday}`)
    happyDom.setURL('http://localhost:3000/')
  })

  it('con un solo día revisado dice cuál ("No hay lugar el domingo 15"), no "el día siguiente"', async () => {
    const lastButOne = addDays(today, 5)
    const lastDay = addDays(today, 6)
    searchParamsRef.current = new URLSearchParams({ date: lastButOne })
    const full = (date: string) =>
      dayOf(date, [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])])
    mockApi(full, { startDate: lastDay, days: [{ date: lastDay, courts: full(lastDay).courts }] })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect(await screen.findByText(`No hay lugar el ${dayLong(lastDay)}.`)).toBeTruthy()
    expect(screen.queryByText(/día siguiente/)).toBeNull()
  })
})
