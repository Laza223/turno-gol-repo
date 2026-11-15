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
// pide el día en mount. Acá se controlan los params y el fetch. Es UNA pantalla: los días en una
// fila, las horas y, con `hora`, la barra de "Reservar" con las canchas libres a esa hora.
const { searchParamsRef, trackMock } = vi.hoisted(() => ({
  searchParamsRef: { current: new URLSearchParams() },
  trackMock: vi.fn(async () => {}),
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParamsRef.current }))

const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
const tomorrow = addDays(today, 1)

/** Entrar por un link a un día (o con `hora`, con la barra abierta). */
const atDay = (date = today, extra: Record<string, string> = {}) => {
  searchParamsRef.current = new URLSearchParams({ date, ...extra })
}

let replaceState: MockInstance<History['replaceState']>
let pushState: MockInstance<History['pushState']>
beforeEach(() => {
  sessionStorage.clear()
  trackMock.mockClear()
  // happy-dom no propaga replaceState/pushState a location.search: se espía la llamada.
  replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined)
  pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined)
  atDay() // casi todo se prueba con el día en la URL; sin `date` se pide explícito
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
 * `/week` → `week` (o lo que devuelva la función según el número de pedido; 'fail' = 500). Ojo: la
 * pantalla siempre pide también la semana desde hoy, y cuenta como pedido.
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

const hourButtons = () => within(screen.getByRole('group', { name: 'Hora' })).getAllByRole('button')
const hour = (time: string) => screen.getByRole('button', { name: new RegExp(`^${time}`) })
const findHour = (time: string) => screen.findByRole('button', { name: new RegExp(`^${time}`) })
const dayRows = () => within(screen.getByRole('group', { name: 'Día' })).getAllByRole('button')
const bar = () => screen.getByRole('complementary', { name: 'Tu turno' })
const findBar = () => screen.findByRole('complementary', { name: 'Tu turno' })
const queryBar = () => screen.queryByRole('complementary', { name: 'Tu turno' })
const courtRadios = () => within(bar()).getAllByRole('radio')
const cta = () => within(bar()).getByRole('link')
const closeBar = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar y elegir otra hora' }))
/** Cambiar de día tocándolo en la fila (0 = hoy). */
const switchTo = (i: number) => fireEvent.click(dayRows()[i]!)
const eveningCourt = (id: string, name: string, format = 5) =>
  court(id, name, [slot('18:00'), slot('19:00', 'occupied'), slot('21:00')], format)
const region = () => screen.getByRole('region', { name: 'Reservá tu turno' })

describe('ReserveSection: el estado sale de la URL', () => {
  it('sin ?date= se ve hoy elegido y se piden la semana y las horas de hoy', async () => {
    searchParamsRef.current = new URLSearchParams()
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await findHour('18:00')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Reservá tu turno')
    expect(
      screen.getByText('Elegí el día y tocá una hora. Podés reservar hasta 6 días adelante.'),
    ).toBeTruthy()
    expect(dayRows()).toHaveLength(7)
    expect(dayRows()[0]!.textContent).toContain('Hoy')
    expect(dayRows()[0]!.textContent).toContain(`Hoy, ${dayLong(today)}`)
    expect(dayRows()[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(dayRows()[2]!.textContent).toContain(capitalizeFirst(dayLong(addDays(today, 2))))
    expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual(
      [
        `/api/public/availability/week?slug=cancha-x&start=${today}`,
        `/api/public/availability?slug=cancha-x&date=${today}`,
      ].sort(),
    )
    expect(queryBar()).toBeNull()
  })

  it('?date= válido elige ese día y pide sus horas con el fetch exacto', async () => {
    atDay(tomorrow)
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await findHour('18:00')
    expect(dayRows()[1]!.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Debajo de cada hora, cuántas canchas quedan libres.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability?slug=cancha-x&date=${tomorrow}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('?date= fuera de la ventana reservable (o vencido) vuelve a hoy', async () => {
    // bookingAdvanceDays = 6 → +30 días queda afuera.
    atDay(addDays(today, 30))
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await findHour('18:00')
    expect(dayRows()).toHaveLength(7)
    expect(dayRows()[0]!.getAttribute('aria-pressed')).toBe('true')
  })

  it('?date= y ?hora= (un link al paso de canchas de antes) abre la barra con esa hora', async () => {
    atDay(today, { hora: '21:00' })
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await findBar()
    expect(hour('21:00').getAttribute('aria-pressed')).toBe('true')
    expect(bar().textContent).toContain(`Hoy, ${dayLong(today)} · 21:00 a 22:00`)
    expect(cta().getAttribute('href')).toBe(
      `/cancha-x/reservar?court=c1&date=${today}&time=21:00&dur=60`,
    )
    // Al entrar por un link el foco no se roba.
    expect(document.activeElement).toBe(document.body)
  })

  it('el turno de las 23:00 termina "24:00" y el de las 00:00, "01:00" (como confirmar)', async () => {
    atDay(today, { hora: '23:00' })
    mockApi((date) => dayOf(date, [court('c1', 'Cancha 1', [slot('23:00'), slot('00:00')])]))
    render(
      <ReserveSection
        tenant={tenantWith({ closesNextDay: true })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    await findBar()
    expect(bar().textContent).toContain('· 23:00 a 24:00')
    fireEvent.click(hour('00:00'))
    expect(bar().textContent).toContain('· 00:00 a 01:00')
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

    await findHour('00:00')
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
    expect(alert.textContent).toContain(dayLong(today))

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await findHour('18:00')
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

    const held = await findHour('20:00')
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
    await findHour('20:00')
    expect(screen.queryByRole('button', { name: /^09:00/ })).toBeNull()
    first.unmount()

    mockApi((date) => dayOf(date, [court('c1', 'Cancha 1', [slot('09:00', 'past')])]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    expect((await screen.findByText(/^No quedan horarios el/)).textContent).toContain(
      dayLong(today),
    )
    expect(screen.queryByRole('group', { name: 'Hora' })).toBeNull()
  })
})

describe('ReserveSection: elegir y cerrar', () => {
  it('el día reemplaza la URL; la hora empuja una entrada con la marca y abre la barra', async () => {
    searchParamsRef.current = new URLSearchParams()
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await findHour('18:00')
    switchTo(1)
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      expect.stringContaining(`date=${tomorrow}`),
    )
    expect(pushState).not.toHaveBeenCalled()
    expect(dayRows()[1]!.getAttribute('aria-pressed')).toBe('true')

    await waitFor(() => expect(hour('21:00').hasAttribute('disabled')).toBe(false))
    fireEvent.click(hour('21:00'))
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(pushState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.stringMatching(new RegExp(`date=${tomorrow}.*hora=21%3A00`)),
    )
    expect(cta().getAttribute('href')).toBe(
      `/cancha-x/reservar?court=c1&date=${tomorrow}&time=21:00&dur=60`,
    )
  })

  it('cerrar la barra con una entrada empujada por la ficha hace history.back() y no toca la URL', async () => {
    atDay(today, { hora: '21:00' })
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ tgReserve: true })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findBar()

    closeBar()

    expect(back).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
  })

  it('cerrar la barra tras entrar por un link reemplaza la URL sin la hora, sin salir del sitio', async () => {
    atDay(today, { hora: '21:00' })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findBar()

    closeBar()

    expect(back).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.not.stringContaining('hora='))
    expect(queryBar()).toBeNull()
    // El día sigue elegido y la hora queda libre para elegir otra; el foco vuelve a ella.
    expect(dayRows()[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(hour('21:00').getAttribute('aria-pressed')).toBe('false')
    expect(document.activeElement).toBe(hour('21:00'))
  })

  it('Esc cierra la barra', async () => {
    atDay(today, { hora: '21:00' })
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findBar()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(queryBar()).toBeNull()
  })

  it('el atrás del navegador (popstate) abre y cierra la barra según la URL', async () => {
    atDay(today, { hora: '21:00' })
    const happyDom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findBar()

    happyDom.setURL(`http://localhost:3000/cancha-x?date=${today}`)
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(queryBar()).toBeNull()
    expect(hour('21:00').getAttribute('aria-pressed')).toBe('false')

    happyDom.setURL('http://localhost:3000/cancha-x')
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(dayRows()[0]!.getAttribute('aria-pressed')).toBe('true')

    happyDom.setURL(`http://localhost:3000/cancha-x?date=${tomorrow}&hora=21%3A00`)
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    await findBar()
    expect(dayRows()[1]!.getAttribute('aria-pressed')).toBe('true')
    happyDom.setURL('http://localhost:3000/')
  })

  it('tocar otro día con la barra empujada la cierra por el historial y después cambia el día', async () => {
    atDay(today, { hora: '21:00' })
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ tgReserve: true })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const happyDom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findBar()

    switchTo(1)
    expect(back).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()

    happyDom.setURL(`http://localhost:3000/cancha-x?date=${today}`)
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(queryBar()).toBeNull()
    expect(dayRows()[1]!.getAttribute('aria-pressed')).toBe('true')
    expect(replaceState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.stringContaining(`date=${tomorrow}`),
    )
    happyDom.setURL('http://localhost:3000/')
  })

  it('con la barra abierta, otra hora reemplaza la URL: el atrás sigue cerrando de una vez', async () => {
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    fireEvent.click(await findHour('21:00'))
    fireEvent.click(hour('21:00')) // doble toque: no empuja otra entrada
    fireEvent.click(hour('18:00'))

    expect(pushState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.stringContaining('hora=18%3A00'))
    expect(bar().textContent).toContain('18:00 a 19:00')
  })

  it('un doble toque en la X vuelve una sola vez; tras volver del bfcache no queda trabada', async () => {
    atDay(today, { hora: '21:00' })
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ tgReserve: true })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findBar()

    closeBar()
    closeBar()
    expect(back).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new Event('pageshow'))
    })
    closeBar()
    expect(back).toHaveBeenCalledTimes(2)
  })

  it('el filtro de tamaño reemplaza la URL (no la empuja) y conserva la marca de la entrada', async () => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ tgReserve: true })
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00')], 5),
        court('c2', 'Cancha 2', [slot('19:00')], 7),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await findHour('19:00')

    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))

    await waitFor(() => expect(hourButtons()).toHaveLength(1))
    expect(replaceState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.stringContaining('formato=7'),
    )
    expect(pushState).not.toHaveBeenCalled()
  })

  it('el tamaño elegido con la barra abierta se conserva al cerrarla por el historial', async () => {
    atDay(today, { hora: '19:00' })
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ tgReserve: true })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const happyDom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00'), slot('19:00')], 5),
        court('c2', 'Cancha 2', [slot('19:00')], 7),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await findBar()

    // 19:00 sigue con lugar en Fútbol 7: la barra queda abierta.
    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))
    await waitFor(() => expect(hourButtons()).toHaveLength(1))
    closeBar()
    expect(back).toHaveBeenCalledTimes(1)

    // La entrada a la que se vuelve no tenía el filtro: se conserva el elegido.
    happyDom.setURL(`http://localhost:3000/cancha-x?date=${today}`)
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(queryBar()).toBeNull()
    expect(screen.getByRole('radio', { name: 'Fútbol 7' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(hourButtons()).toHaveLength(1)
    expect(replaceState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.stringContaining('formato=7'),
    )
    happyDom.setURL('http://localhost:3000/')
  })

  it('un tamaño sin lugar a esa hora cierra la barra por el historial (sin entrada colgada)', async () => {
    atDay(today, { hora: '18:00' })
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ tgReserve: true })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const happyDom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00')], 5),
        court('c2', 'Cancha 2', [slot('19:00')], 7),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await findBar()

    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()

    happyDom.setURL(`http://localhost:3000/cancha-x?date=${today}`)
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(queryBar()).toBeNull()
    expect(screen.getByRole('radio', { name: 'Fútbol 7' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(replaceState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.stringContaining('formato=7'),
    )
    happyDom.setURL('http://localhost:3000/')
  })

  it('al tocar una hora el foco entra a la barra (la cancha elegida) y se anuncia', async () => {
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('18:00')
    // En la carga el foco no se roba.
    expect(document.activeElement).toBe(document.body)

    fireEvent.click(hour('21:00'))

    await waitFor(() => expect(document.activeElement).toBe(courtRadios()[0]))
    expect(screen.getByRole('status').textContent).toBe('21:00: 1 cancha libre.')
  })
})

describe('ReserveSection: la fila de días', () => {
  it('cada día dice su estado con palabras: Hay lugar, Completo, Sin horarios y Cerrado', async () => {
    searchParamsRef.current = new URLSearchParams()
    const room = [court('c1', 'Cancha 1', [slot('18:00')])]
    const full = [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])]
    const day = (i: number, courts: Court[]) => ({ date: addDays(today, i), courts })
    mockApi((date) => dayOf(date, room), {
      startDate: today,
      days: [day(0, room), day(1, full), day(2, []), day(4, room)],
    })
    render(
      <ReserveSection
        tenant={tenantWith({ closedDates: [addDays(today, 3)] })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )

    await waitFor(() => expect(dayRows()[0]!.textContent).toContain('Hay lugar'))
    const rows = dayRows()
    expect(rows[1]!.textContent).toContain('Completo')
    expect(rows[1]!.hasAttribute('disabled')).toBe(true)
    expect(rows[2]!.textContent).toContain('Sin horarios')
    expect(rows[2]!.hasAttribute('disabled')).toBe(true)
    expect(rows[3]!.textContent).toContain('Cerrado')
    expect(rows[3]!.hasAttribute('disabled')).toBe(true)
    expect(rows[4]!.textContent).toContain('Hay lugar')
    expect(rows[4]!.hasAttribute('disabled')).toBe(false)
    // Más allá de lo que trae la semana: habilitado y sin estado.
    expect(rows[5]!.textContent).not.toMatch(/Hay lugar|Completo|Sin horarios|Cerrado/)
    expect(rows[5]!.hasAttribute('disabled')).toBe(false)
  })

  it('un día cerrado se sabe al instante, sin esperar la semana, y no se puede elegir', () => {
    searchParamsRef.current = new URLSearchParams()
    global.fetch = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof global.fetch
    render(
      <ReserveSection
        tenant={tenantWith({ closedDates: [tomorrow] })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    return waitFor(() => {
      expect(dayRows()[1]!.textContent).toContain('Cerrado')
      expect(dayRows()[1]!.hasAttribute('disabled')).toBe(true)
      expect(dayRows()[0]!.textContent).not.toContain('Cerrado')
    })
  })

  it('si la semana falla los días quedan habilitados y sin estado', async () => {
    searchParamsRef.current = new URLSearchParams()
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]), 'fail')
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await waitFor(() => expect(region().getAttribute('data-state')).toBe('ready'))
    for (const row of dayRows()) {
      expect(row.hasAttribute('disabled')).toBe(false)
      expect(row.textContent).not.toMatch(/Hay lugar|Completo|Sin horarios/)
    }
  })

  it('el estado de los días cuenta todas las canchas, no solo el tamaño elegido', async () => {
    searchParamsRef.current = new URLSearchParams({ formato: '7' })
    const days = [
      {
        date: today,
        courts: [
          court('c1', 'Cancha 1', [slot('18:00')], 5),
          court('c2', 'Cancha 2', [slot('18:00', 'occupied')], 7),
        ],
      },
    ]
    mockApi((date) => dayOf(date, []), { startDate: today, days })
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)

    // La F7 está ocupada pero la F5 no: el día tiene lugar y se puede elegir.
    await waitFor(() => expect(dayRows()[0]!.textContent).toContain('Hay lugar'))
    expect(dayRows()[0]!.hasAttribute('disabled')).toBe(false)
  })
})

describe('ReserveSection: la semana alimenta las horas', () => {
  it('si la semana ya trajo ese día, las horas salen sin esqueleto mientras el día se refresca', async () => {
    searchParamsRef.current = new URLSearchParams()
    const week: WeeklyAvailabilityResponse = {
      startDate: today,
      days: [{ date: tomorrow, courts: [court('c1', 'Cancha 1', [slot('18:00'), slot('20:00')])] }],
    }
    let release: (res: Response) => void = () => {}
    const fetchMock = vi.fn((input: string) =>
      String(input).includes('/week')
        ? Promise.resolve(json(week))
        : new Promise<Response>((resolve) => (release = resolve)),
    )
    global.fetch = fetchMock as unknown as typeof global.fetch
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(dayRows()[1]!.textContent).toContain('Hay lugar'))

    switchTo(1)

    // Las horas ya están, antes de que responda el día.
    expect(hour('18:00')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability?slug=cancha-x&date=${tomorrow}`,
      expect.anything(),
    )
    await act(async () =>
      release(json(dayOf(tomorrow, [court('c1', 'Cancha 1', [slot('18:00'), slot('21:00')])]))),
    )
    await findHour('21:00')
  })
})

describe('ReserveSection: la barra y las canchas', () => {
  it('lista las canchas libres a esa hora, la primera elegida; cambiar de cancha cambia el link y el precio', async () => {
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('21:00', 'free', 1500000)]),
        court('c2', 'Cancha 2', [slot('21:00', 'occupied')], 7),
        court('c3', 'Cancha 3', [slot('21:00', 'free', 1800000)], 7),
      ]),
    )

    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    fireEvent.click(await findHour('21:00'))

    const radios = courtRadios()
    expect(radios).toHaveLength(2)
    expect(radios[1]!.textContent).toContain('Cancha 3')
    expect(radios[1]!.textContent).toContain('Fútbol 7')
    expect(radios[1]!.textContent).toContain('18.000')
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true')
    expect(cta().getAttribute('href')).toBe(
      `/cancha-x/reservar?court=c1&date=${today}&time=21:00&dur=60`,
    )
    expect(cta().textContent).toContain('Reservar · $')
    expect(cta().textContent).toContain('15.000')

    fireEvent.click(radios[1]!)
    expect(cta().getAttribute('href')).toBe(
      `/cancha-x/reservar?court=c3&date=${today}&time=21:00&dur=60`,
    )
    expect(cta().textContent).toContain('18.000')
  })

  it.each([1, 3, 5, 10, 16])('con %i cancha(s) libres a la hora, las lista todas', async (n) => {
    mockApi((date) =>
      dayOf(
        date,
        Array.from({ length: n }, (_, i) => court(`c${i}`, `Cancha ${i + 1}`, [slot('21:00')])),
      ),
    )

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await findHour('21:00'))

    expect(courtRadios()).toHaveLength(n)
  })

  it('?hora= que no existe (o está completa) no abre la barra; una válida, sí', async () => {
    atDay(today, { hora: '03:00' })
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    const first = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await findHour('18:00')
    expect(queryBar()).toBeNull()
    first.unmount()

    // 19:00 existe pero está completa.
    atDay(today, { hora: '19:00' })
    const second = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await findHour('18:00')
    expect(queryBar()).toBeNull()
    second.unmount()

    atDay(today, { hora: '18:00' })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    expect(await findBar()).toBeTruthy()
  })

  it('sin reserva online el botón abre WhatsApp con el pedido escrito de la cancha elegida', async () => {
    mockApi((date) => dayOf(date, [court('c1', 'Cancha 1', [slot('21:00', 'free', 1200000)])]))

    render(
      <ReserveSection
        tenant={tenantWith({ allowOnlineBooking: false })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    fireEvent.click(await findHour('21:00'))

    const link = cta()
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//)
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain(
      'a las 21:00 (Cancha 1, Fútbol 5).',
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.textContent).toBe('Consultar por WhatsApp')
    expect(link.getAttribute('href')).not.toContain('/reservar')
  })

  it('sin reserva online ni número de WhatsApp válido, el botón llama al complejo', async () => {
    mockApi((date) => dayOf(date, [court('c1', 'Cancha 1', [slot('21:00')])]))
    render(
      <ReserveSection
        tenant={tenantWith({ allowOnlineBooking: false, phone: '4444' })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    fireEvent.click(await findHour('21:00'))
    const link = cta()
    expect(link.getAttribute('href')).toMatch(/^tel:/)
    expect(link.textContent).toBe('Llamar al complejo')
    expect(link.hasAttribute('target')).toBe(false)
  })

  it('el filtro de tamaño deja solo las horas de ese tamaño, sin volver a pedir el día', async () => {
    const fetchMock = mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00')], 5),
        court('c2', 'Cancha 2', [slot('19:00')], 7),
      ]),
    )

    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await findHour('19:00')
    expect(hourButtons()).toHaveLength(2)

    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))

    await waitFor(() => expect(hourButtons()).toHaveLength(1))
    expect(hourButtons()[0]!.textContent).toContain('19:00')
    expect(fetched(fetchMock, today)).toBe(1)
    expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.stringContaining('formato=7'))

    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }))
    await waitFor(() => expect(hourButtons()).toHaveLength(2))
  })

  it('con el filtro elegido, el link a confirmar lleva el tamaño; con "Todos", no', async () => {
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('19:00')], 7),
        court('c2', 'Cancha 2', [slot('19:00')], 5),
      ]),
    )

    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await findHour('19:00')
    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))
    fireEvent.click(await findHour('19:00'))
    expect(courtRadios()).toHaveLength(1)
    expect(cta().getAttribute('href')).toContain('/reservar?court=c1')
    expect(cta().getAttribute('href')).toContain('formato=7')
    cleanup()

    // Con "Todos" no viaja ningún tamaño.
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    fireEvent.click(await findHour('19:00'))
    expect(courtRadios()).toHaveLength(2)
    expect(cta().getAttribute('href')).not.toContain('formato')
  })

  it('con un solo tamaño no hay filtro de tamaño', async () => {
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('18:00')
    expect(screen.queryByRole('radiogroup', { name: 'Formato' })).toBeNull()
  })
})

describe('ReserveSection: precios ocultos (hidePrices)', () => {
  // El servidor ya manda `price: null` con hidePrices; acá se FUERZA un precio para probar la
  // segunda llave de la barra: ningún monto sale aunque el dato llegue.
  const priced = (date: string) =>
    dayOf(date, [
      court('c1', 'Cancha 1', [slot('21:00', 'free', 1500000)]),
      court('c2', 'Cancha 2', [slot('21:00', 'free', 1800000)]),
    ])

  it('no hay ningún $ en el texto ni en un aria-label, ni con la barra abierta', async () => {
    mockApi(priced)

    render(
      <ReserveSection
        tenant={tenantWith({ hidePrices: true })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    fireEvent.click(await findHour('21:00'))
    await findBar()

    expect(document.body.textContent).not.toContain('$')
    expect(document.body.textContent).not.toMatch(/15\.000|18\.000/)
    expect(cta().textContent).toBe('Reservar')
    const labels = [...document.querySelectorAll('[aria-label]')].map((el) =>
      el.getAttribute('aria-label'),
    )
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.filter((label) => label!.includes('$'))).toEqual([])
  })

  it('control: con los precios visibles el monto sale en la cancha y en el botón', async () => {
    mockApi(priced)

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await findHour('21:00'))

    expect((await findBar()).textContent).toContain('18.000')
    expect(cta().textContent).toContain('15.000')
  })
})

describe('ReserveSection: días sin lugar', () => {
  it('un día cerrado al que se llega por link lo dice y ofrece el próximo día abierto', async () => {
    atDay(tomorrow)
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(
      <ReserveSection
        tenant={tenantWith({ closedDates: [tomorrow] })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )

    expect((await screen.findByText(/^Cerrado el/)).textContent).toContain(dayLong(tomorrow))
    // El día cerrado no pide horas.
    expect(fetched(fetchMock, tomorrow)).toBe(0)

    const dayAfter = addDays(today, 2)
    fireEvent.click(screen.getByRole('button', { name: `Ver el ${dayLong(dayAfter)}` }))

    await findHour('18:00')
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability?slug=cancha-x&date=${dayAfter}`,
      expect.anything(),
    )
    // Elegir día es un filtro: reemplaza.
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      expect.stringContaining(`date=${dayAfter}`),
    )
    expect(pushState).not.toHaveBeenCalled()
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
    // Con otro día al que ir, nueve "Completo" no dicen más que el aviso: no hay grilla.
    expect(screen.queryByRole('group', { name: 'Hora' })).toBeNull()
    fireEvent.click(button)
    await findHour('18:00')
    expect(dayRows()[2]!.getAttribute('aria-pressed')).toBe('true')
  })

  it('si en la ventana no queda lugar en ningún día, lo dice y ofrece hablar con el complejo', async () => {
    const full = (date: string) =>
      dayOf(date, [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])])
    // La ventana de 6 días deja 6 días por revisar después de hoy: el texto dice el número real.
    mockApi(full, (call) =>
      call === 1
        ? { startDate: today, days: [] }
        : {
            startDate: tomorrow,
            days: Array.from({ length: 6 }, (_, i) => {
              const date = addDays(tomorrow, i)
              return { date, courts: full(date).courts }
            }),
          },
    )

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
    await findHour('21:00')

    const status = screen.getByRole('status')
    expect(status.className).toContain('sr-only')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toBe(`${capitalizeFirst(dayLong(today))}: 2 horarios con lugar.`)

    fireEvent.click(hour('21:00'))
    expect(status.textContent).toBe('21:00: 2 canchas libres.')
  })

  it('profile.viewed sale una vez por pestaña y complejo, con las primeras horas', async () => {
    searchParamsRef.current = new URLSearchParams()
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    const first = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await waitFor(() => expect(trackMock).toHaveBeenCalledTimes(1))
    expect(trackMock).toHaveBeenCalledWith('cancha-x', false)

    // Cambiar de día y volver a montar en la misma pestaña no repite el evento.
    switchTo(1)
    await findHour('18:00')
    first.unmount()
    atDay(tomorrow)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('18:00')
    expect(trackMock).toHaveBeenCalledTimes(1)
  })

  it('profile.viewed avisa si la URL traía ?date= y sale con las horas del día', async () => {
    atDay(tomorrow)
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await waitFor(() => expect(trackMock).toHaveBeenCalledWith('cancha-x', true))
  })

  it('profile.viewed no sale si las horas no cargaron, aunque la semana sí', async () => {
    mockApi(() => 'fail')
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('alert')
    await act(async () => {})
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('profile.viewed sale aunque la semana falle, si las horas llegaron', async () => {
    searchParamsRef.current = new URLSearchParams()
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]), 'fail')
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(trackMock).toHaveBeenCalledTimes(1))
  })
})

const heldDay = (date: string) =>
  dayOf(date, [court('c1', 'Cancha 1', [slot('18:00'), slot('20:00', 'held')])])
const freeDay = (date: string) => dayOf(date, [court('c1', 'Cancha 1', [slot('18:00')])])
/**
 * La hora aparece en el DOM antes de que React corra los efectos de ese render (el que arma el
 * intervalo de "Señando"), y la semana desde hoy llega por su lado: contar intervalos sin esperar
 * es una carrera.
 */
const settle = () => act(async () => {})
const fetched = (fetchMock: { mock: { calls: unknown[][] } }, date: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(`date=${date}`)).length

describe('ReserveSection: refresco con "Señando"', () => {
  async function timersWith(byDate: (date: string) => AvailabilityResponse) {
    const fetchMock = mockApi(byDate)
    const view = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await findHour('18:00')
    await settle()
    const timers = vi.getTimerCount()
    return { fetchMock, timers, view }
  }

  it('solo hay intervalo de 30 s si alguna hora está "Señando", y vuelve a pedir el día', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    const free = await timersWith(freeDay)
    free.view.unmount()
    const held = await timersWith(heldDay)

    expect(held.timers).toBe(free.timers + 1)
    expect(fetched(held.fetchMock, today)).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(fetched(held.fetchMock, today)).toBe(2)
  })
})

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
/** Los pedidos de UN día (no los de la semana). */
const dayCalls = (calls: ReturnType<typeof pendingFetch>) =>
  calls.filter((c) => !c.url.includes('/week'))
/** Los pedidos de la semana que busca "otro día con lugar" (no la de la fila, desde hoy). */
const searchCalls = (calls: ReturnType<typeof pendingFetch>) =>
  calls.filter((c) => c.url.includes('/week') && !c.url.includes(`start=${today}`))

describe('ReserveSection: refresco, abortos y limpieza', () => {
  it('con la pestaña oculta no se refresca el día "Señando"; al volver, sí', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    setVisibility('hidden')
    const fetchMock = mockApi(heldDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('18:00')

    await act(() => vi.advanceTimersByTimeAsync(90_000))
    expect(fetched(fetchMock, today)).toBe(1)

    await act(async () => setVisibility('visible'))
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(fetched(fetchMock, today)).toBe(2)
  })

  it('cambiar de día aborta el pedido pendiente y desmontar aborta el del día nuevo', async () => {
    const calls = pendingFetch()
    const view = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(1))

    switchTo(1)
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(2))
    expect(dayCalls(calls)[0]!.signal.aborted).toBe(true)
    expect(dayCalls(calls)[1]!.signal.aborted).toBe(false)

    view.unmount()
    expect(dayCalls(calls)[1]!.signal.aborted).toBe(true)
  })

  it('el refresco de "Señando" aborta el anterior si sigue pendiente y se aborta al desmontar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const calls = pendingFetch()
    const view = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(1))
    await act(async () => dayCalls(calls)[0]!.resolve(heldDay(today)))
    await findHour('18:00')

    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(dayCalls(calls)).toHaveLength(2)
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(dayCalls(calls)).toHaveLength(3)
    expect(dayCalls(calls)[1]!.signal.aborted).toBe(true)
    expect(dayCalls(calls)[2]!.signal.aborted).toBe(false)

    view.unmount()
    expect(dayCalls(calls)[2]!.signal.aborted).toBe(true)
  })

  it('un pedido abortado no cuenta como fallo: no parpadea el error al re-pedir el mismo día', async () => {
    // StrictMode monta, desmonta y vuelve a montar: el primer pedido se aborta y rechaza con
    // AbortError mientras el segundo sigue pendiente. Sin la guarda `aborted` ese rechazo quedaba
    // como un fallo de red y tapaba las horas con un alerta.
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />, {
      wrapper: StrictMode,
    })
    await waitFor(() => expect(dayCalls(calls).length).toBeGreaterThanOrEqual(2))
    await act(async () => {})
    expect(dayCalls(calls)[0]!.signal.aborted).toBe(true)
    expect(dayCalls(calls).at(-1)!.signal.aborted).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()

    await act(async () => dayCalls(calls).at(-1)!.resolve(freeDay(today)))
    expect(await findHour('18:00')).toBeTruthy()
  })

  it('sin datos, mostrar y ocultar la pestaña no reinicia el pedido en vuelo', async () => {
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(1))

    for (let i = 0; i < 10; i++) {
      await act(async () => setVisibility(i % 2 === 0 ? 'hidden' : 'visible'))
    }

    expect(dayCalls(calls)).toHaveLength(1)
    expect(dayCalls(calls)[0]!.signal.aborted).toBe(false)
    await act(async () => dayCalls(calls)[0]!.resolve(freeDay(today)))
    expect(await findHour('18:00')).toBeTruthy()
  })

  it('con datos vencidos, cada vuelta a la pestaña hace a lo sumo un pedido', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(1))
    await act(async () => dayCalls(calls)[0]!.resolve(freeDay(today)))
    await findHour('18:00')

    vi.setSystemTime(Date.now() + 130_000)
    for (let back = 1; back <= 3; back++) {
      await act(async () => setVisibility('hidden'))
      expect(dayCalls(calls)).toHaveLength(back) // oculta no pide nada
      await act(async () => setVisibility('visible'))
      expect(dayCalls(calls)).toHaveLength(back + 1) // una por vuelta, no una por evento
    }
  })

  it('no queda ningún intervalo al dejar de estar "Señando" ni al desmontar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const base = vi.getTimerCount()
    const fetchMock = mockApi((date, call) => (call === 1 ? heldDay(date) : freeDay(date)))
    const view = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await findHour('18:00')
    await settle()
    const whileHeld = vi.getTimerCount()

    await act(() => vi.advanceTimersByTimeAsync(30_000)) // la respuesta ya no trae "Señando"
    expect(fetched(fetchMock, today)).toBe(2)
    expect(vi.getTimerCount()).toBe(whileHeld - 1)
    await act(() => vi.advanceTimersByTimeAsync(120_000))
    expect(fetched(fetchMock, today)).toBe(2)

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
    await findHour('18:00')
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
    await findHour('18:00')
    switchTo(1)
    await waitFor(() => expect(fetched(fetchMock, tomorrow)).toBe(1))
    await findHour('18:00') // la respuesta ya se pintó: recién ahí se mueve el reloj
    return fetchMock
  }

  it('volver a un día visto hace menos de 120 s no pide nada; vencido, lo muestra y lo vuelve a pedir', async () => {
    const fetchMock = await onTodayThenTomorrow()

    vi.setSystemTime(Date.now() + 100_000)
    switchTo(0)
    await act(async () => {})
    expect(fetched(fetchMock, today)).toBe(1)

    switchTo(1)
    vi.setSystemTime(Date.now() + 130_000)
    switchTo(0)
    // Lo vencido se sigue viendo mientras llega lo nuevo: sin esqueleto ni salto.
    expect(hour('18:00')).toBeTruthy()
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

  it('pasada la medianoche, el día elegido que ya pasó vuelve a hoy y limpia la URL', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    // La URL (que el navegador ya había actualizado) también trae hora y tamaño: tampoco mandan,
    // y se borran de la barra de direcciones junto con el día (lo demás se conserva).
    const happyDom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM
    happyDom.setURL(`http://localhost:3000/cancha-x?date=${today}&hora=18%3A00&formato=7&utm=x`)
    const fetchMock = mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00'), slot('21:00')], 5),
        court('c2', 'Cancha 2', [slot('18:00'), slot('21:00')], 7),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await findHour('21:00')
    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))
    fireEvent.click(await findHour('21:00'))
    expect(bar()).toBeTruthy()

    // Dos días después `today` ya es pasado: el reloj de la app avisa en el próximo minuto.
    vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000)
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    expect(queryBar()).toBeNull()
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/cancha-x?utm=x')
    // Nada del día viejo se hereda al día nuevo: ni la hora ni el tamaño.
    const newToday = addDays(today, 2)
    expect(dayRows()[0]!.getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(fetched(fetchMock, newToday)).toBe(1))
    await findHour('21:00')
    expect(hourButtons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.getByRole('radio', { name: 'Todos' }).getAttribute('aria-checked')).toBe('true')
    happyDom.setURL('http://localhost:3000/')
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
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(1))
    await act(async () => dayCalls(calls)[0]!.resolve({ error: 'boom' }, 500))
    await screen.findByRole('alert')

    switchTo(1)
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(2))
    await act(async () => dayCalls(calls)[1]!.resolve(freeDay(tomorrow)))
    await findHour('18:00')

    switchTo(0)
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(3))
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
    // Pedido 1 = la semana de la fila; 2 = la búsqueda (falla); 3 = el reintento.
    mockApi(fullDay, (call) => (call <= 2 ? 'fail' : week()))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect(await screen.findByText('No pudimos buscar otro día.')).toBeTruthy()
    expect(screen.queryByText(/No hay lugar/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('button', { name: `Ver el ${dayLong(roomDay)}` })).toBeTruthy()
  })

  it('el último día reservable no revisa nada y no dice que miró los próximos días', async () => {
    atDay(addDays(today, 6))
    const fetchMock = mockApi(fullDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect(await screen.findByText('Es el último día para reservar.')).toBeTruthy()
    expect(screen.queryByText(/próximos/)).toBeNull()
    // Solo la semana de la fila; ninguna búsqueda después del último día.
    expect(
      fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes('/week') && !url.includes(`start=${today}`)),
    ).toEqual([])
  })

  it('con un solo día revisado dice cuál ("No hay lugar el domingo 15"), no "el día siguiente"', async () => {
    const lastButOne = addDays(today, 5)
    const lastDay = addDays(today, 6)
    atDay(lastButOne)
    const full = (date: string) =>
      dayOf(date, [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])])
    mockApi(full, { startDate: lastDay, days: [{ date: lastDay, courts: full(lastDay).courts }] })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect(await screen.findByText(`No hay lugar el ${dayLong(lastDay)}.`)).toBeTruthy()
    expect(screen.queryByText(/día siguiente/)).toBeNull()
  })

  it('la semana de "otro día con lugar" también vale 120 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const fetchMock = mockApi(fullDay, () => ({ startDate: tomorrow, days: [] }))
    const searches = () =>
      fetchMock.mock.calls.filter(
        ([url]) => String(url).includes('/week') && !String(url).includes(`start=${today}`),
      ).length
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(searches()).toBe(1))
    switchTo(1) // otro día completo: otra semana
    await waitFor(() => expect(searches()).toBe(2))

    vi.setSystemTime(Date.now() + 100_000)
    switchTo(0)
    await act(async () => {})
    expect(searches()).toBe(2) // 100 s: sigue valiendo

    switchTo(1)
    vi.setSystemTime(Date.now() + 30_000)
    switchTo(0)
    await waitFor(() => expect(searches()).toBe(3)) // 130 s: venció
  })

  it('cambiar de día con la búsqueda en vuelo no deja un error guardado para ese día', async () => {
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(1))
    await act(async () =>
      dayCalls(calls)[0]!.resolve(
        dayOf(today, [court('c1', 'Cancha 1', [slot('18:00', 'occupied')])]),
      ),
    )
    await waitFor(() => expect(searchCalls(calls)).toHaveLength(1))

    // Irse a otro día aborta la búsqueda en vuelo; ese rechazo no es un fallo de la búsqueda.
    switchTo(1)
    await waitFor(() => expect(searchCalls(calls)[0]!.signal.aborted).toBe(true))
    await act(async () => {})

    switchTo(0)
    await waitFor(() => expect(searchCalls(calls)).toHaveLength(2)) // se vuelve a buscar
    expect(screen.queryByText('No pudimos buscar otro día.')).toBeNull()
  })
})

describe('ReserveSection: una sola cancha, estado de la reserva y avisos', () => {
  it('con una sola cancha la hora libre es "Libre", sin ámbar; con dos queda "Queda 1"', async () => {
    mockApi((date) => dayOf(date, [court('c1', 'Cancha 1', [slot('18:00')])]))
    const one = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    const alone = await findHour('18:00')
    expect(alone.textContent).toContain('Libre')
    expect(alone.textContent).not.toContain('Queda 1')
    expect(alone.dataset.state).toBe('only')
    one.unmount()

    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00')]),
        court('c2', 'Cancha 2', [slot('18:00', 'occupied')]),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    const scarce = await findHour('18:00')
    expect(scarce.textContent).toContain('Queda 1')
    // El ámbar de `ficha.css` cuelga de este estado.
    expect(scarce.dataset.state).toBe('last')
  })

  it('"Señando" tiene su propio estado (borde punteado), no el de "Queda 1"', async () => {
    mockApi(heldDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    const held = await findHour('20:00')
    expect(held.dataset.state).toBe('held')
  })

  it('las horas son botones con aria-pressed (no radios)', async () => {
    mockApi(freeDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    const btn = await findHour('18:00')
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('radio', { name: /^18:00/ })).toBeNull()
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('data-state: loading → ready, closed y error', async () => {
    mockApi(freeDay)
    const ready = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    expect(region().getAttribute('data-state')).toBe('loading')
    await findHour('18:00')
    expect(region().getAttribute('data-state')).toBe('ready')
    expect(region().getAttribute('aria-busy')).toBe('false')
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

  it('sin anticipación, la ayuda dice que se reserva solo para hoy', async () => {
    searchParamsRef.current = new URLSearchParams()
    mockApi(freeDay)
    render(
      <ReserveSection
        tenant={tenantWith({ bookingAdvanceDays: 0 })}
        formats={[5]}
        trackViewed={trackMock}
      />,
    )
    expect(await screen.findByText('Tocá una hora. Reservás solo para hoy.')).toBeTruthy()
    expect(screen.queryByText(/0 días/)).toBeNull()
    expect(dayRows()).toHaveLength(1)
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
    await waitFor(() => expect(trackMock).toHaveBeenCalledWith('cancha-x', true))
    expect(fetched(fetchMock, today)).toBe(0)
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

    expect(await findHour('18:00')).toBeTruthy()
    await waitFor(() => expect(trackMock).toHaveBeenCalledTimes(1))
  })
})

describe('ReserveSection: frescura, día fuera de ventana y hora ocupada', () => {
  const expired = () => vi.setSystemTime(Date.now() + 130_000)

  it('un refresco que falla no tapa las horas que ya se ven', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const fetchMock = mockApi((date, call) => (call === 1 ? freeDay(date) : 'fail'))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('18:00')
    switchTo(1)
    await waitFor(() => expect(fetched(fetchMock, tomorrow)).toBe(1))
    expired()

    switchTo(0)
    await waitFor(() => expect(fetched(fetchMock, today)).toBe(2)) // el refresco falló
    await act(async () => {})

    expect(screen.queryByRole('alert')).toBeNull()
    expect(hour('18:00')).toBeTruthy()
  })

  it('elegir una hora con el día vencido lo vuelve a pedir; con datos frescos, no', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('18:00')
    await act(async () => {})
    expect(fetched(fetchMock, today)).toBe(1)

    expired()
    fireEvent.click(hour('21:00'))
    await waitFor(() => expect(fetched(fetchMock, today)).toBe(2))
  })

  it('con datos frescos, elegir una hora no vuelve a pedir el día', async () => {
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await findHour('21:00'))
    await act(async () => {})
    expect(fetched(fetchMock, today)).toBe(1)
  })

  it('si la hora elegida se ocupa en el refresco, la barra lo dice, lo anuncia y deja elegir otra', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    mockApi((date, call) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00'), slot('21:00', call === 1 ? 'free' : 'occupied')]),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('21:00')
    expired()

    fireEvent.click(hour('21:00'))
    expect(await screen.findByText('Ya se ocupó el horario 21:00.')).toBeTruthy()

    // La barra no se cierra sola: sacude (`data-taken`) y ya no ofrece canchas ni el botón.
    expect(bar().hasAttribute('data-taken')).toBe(true)
    expect(screen.getByRole('status').textContent).toBe(
      'Ya se ocupó el horario 21:00. Elegí otra hora.',
    )
    expect(within(bar()).queryAllByRole('radio')).toHaveLength(0)
    expect(within(bar()).queryByRole('link')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Elegir otra hora' }))
    expect(queryBar()).toBeNull()
    expect(hour('18:00').getAttribute('aria-pressed')).toBe('false')
  })

  it('sin hora elegida antes (URL con una hora que no existe o completa) no dice "se ocupó"', async () => {
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    for (const hora of ['03:00', '19:00']) {
      atDay(today, { hora })
      const view = render(
        <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
      )
      await findHour('18:00')
      expect(screen.queryByText(/Ya se ocupó el horario/)).toBeNull()
      view.unmount()
    }
  })

  it('si la hora deja de servir porque cambió el tamaño, no dice que se ocupó: cierra la barra', async () => {
    atDay(today, { hora: '18:00' })
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00')], 5),
        court('c2', 'Cancha 2', [slot('19:00')], 7),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await findBar()

    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))
    await waitFor(() => expect(hourButtons()).toHaveLength(1))

    expect(screen.queryByText(/Ya se ocupó el horario/)).toBeNull()
    expect(queryBar()).toBeNull()
    expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.not.stringContaining('hora='))
  })

  it('400 date_out_of_range: dice que ese día ya no se puede reservar y ofrece "Ver hoy", sin reintentar', async () => {
    mockApi((date) => (date === today ? freeDay(date) : 400))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('18:00')
    switchTo(1)

    const text = (await screen.findByRole('alert')).textContent ?? ''
    expect(text).toContain('Ese día ya no se puede reservar')
    expect(text).not.toContain('de nuestro lado')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ver hoy' }))
    expect(await findHour('18:00')).toBeTruthy()
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      expect.stringContaining(`date=${today}`),
    )
  })

  it('un 400 que no es de fecha (invalid_params) sigue siendo un fallo del servidor', async () => {
    const calls = pendingFetch()
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await waitFor(() => expect(dayCalls(calls)).toHaveLength(1))
    await act(async () => dayCalls(calls)[0]!.resolve({ error: 'invalid_params' }, 400))

    expect((await screen.findByRole('alert')).textContent).toContain('de nuestro lado')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ver hoy' })).toBeNull()
  })
})
