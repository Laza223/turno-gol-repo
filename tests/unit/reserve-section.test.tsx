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
// pide el día en mount. Acá se controlan los params y el fetch. Sin `date` es el paso 1 (días);
// con `date`, el 2 (horas); con `date` y `hora`, el 3 (canchas).
const { searchParamsRef, trackMock } = vi.hoisted(() => ({
  searchParamsRef: { current: new URLSearchParams() },
  trackMock: vi.fn(async () => {}),
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParamsRef.current }))

const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
const tomorrow = addDays(today, 1)

/** Entrar por un link al paso 2 (o al 3 con `hora`) de un día. */
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
  atDay() // casi todo se prueba desde el paso 2; el paso 1 lo pide explícito
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'visibilityState') // vuelve el getter del prototipo
  Reflect.deleteProperty(document, 'startViewTransition')
  delete document.documentElement.dataset.reserveStep
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
 * `/week` → `week` (o lo que devuelva la función según el número de pedido; 'fail' = 500). Ojo: el
 * paso 1 también pide la semana desde hoy, y cuenta como pedido.
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
const dayRows = () => within(screen.getByRole('list', { name: 'Día' })).getAllByRole('button')
const courtList = (time: string) =>
  screen.getByRole('list', { name: `Canchas libres a las ${time}` })
const heading = () => screen.getByRole('heading', { level: 2 })
/** Vuelve al paso 1 y elige el día `i` de la lista (0 = hoy): cambiar de día desde el paso 2. */
function switchTo(i: number) {
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
  fireEvent.click(dayRows()[i]!)
}
const eveningCourt = (id: string, name: string, format = 5) =>
  court(id, name, [slot('18:00'), slot('19:00', 'occupied'), slot('21:00')], format)

describe('ReserveSection: el paso sale de la URL', () => {
  it('sin ?date= es el paso 1: la lista de días, sin pedir ningún día', async () => {
    searchParamsRef.current = new URLSearchParams()
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe(
      '¿Qué día querés jugar?',
    )
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy()
    expect(screen.getByText('Reservás hasta 6 días antes')).toBeTruthy()
    expect(dayRows()).toHaveLength(7)
    expect(dayRows()[0]!.textContent).toContain('Hoy')
    expect(dayRows()[0]!.textContent).toContain(dayLong(today))
    expect(dayRows()[1]!.textContent).toContain('Mañana')
    expect(dayRows()[2]!.textContent).toContain(capitalizeFirst(dayLong(addDays(today, 2))))
    expect(screen.queryByRole('button', { name: 'Volver' })).toBeNull()
    // Solo la semana: los días se piden cuando se elige uno.
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/public/availability/week?slug=cancha-x&start=${today}`,
    ])
  })

  it('?date= válido es el paso 2 de ese día: pide sus horas con el fetch exacto', async () => {
    atDay(tomorrow)
    const fetchMock = mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await findHour('18:00')
    expect(heading().textContent).toBe('¿A qué hora?')
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy()
    expect(
      screen.getByText(
        `${capitalizeFirst(dayLong(tomorrow))} · Debajo de cada hora, cuántas canchas quedan libres.`,
      ),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/availability?slug=cancha-x&date=${tomorrow}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('?date= fuera de la ventana reservable (o vencido) vuelve al paso 1', async () => {
    // bookingAdvanceDays = 6 → +30 días queda afuera.
    atDay(addDays(today, 30))
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe(
      '¿Qué día querés jugar?',
    )
    expect(dayRows()).toHaveLength(7)
  })

  it('?date= y ?hora= es el paso 3: las canchas libres a esa hora', async () => {
    atDay(today, { hora: '21:00' })
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await screen.findByRole('list', { name: 'Canchas libres a las 21:00' })
    expect(heading().textContent).toBe('¿En qué cancha?')
    expect(screen.getByText('Paso 3 de 3')).toBeTruthy()
    expect(
      screen.getByText(
        `${capitalizeFirst(dayLong(today))} · 21:00 a 22:00 · Tocá la cancha y seguís a confirmar.`,
      ),
    ).toBeTruthy()
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
    await screen.findByRole('list', { name: 'Canchas libres a las 23:00' })
    expect(screen.getByText(/· 23:00 a 24:00 ·/)).toBeTruthy()
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

describe('ReserveSection: avanzar y volver', () => {
  it('día → hora → cancha: cada toque empuja un paso al historial con la marca', async () => {
    searchParamsRef.current = new URLSearchParams()
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await screen.findByRole('list', { name: 'Día' })
    fireEvent.click(dayRows()[1]!)
    expect(pushState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.stringContaining(`date=${tomorrow}`),
    )
    expect(heading().textContent).toBe('¿A qué hora?')
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy()

    fireEvent.click(await findHour('21:00'))
    expect(pushState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.stringContaining('hora=21%3A00'),
    )
    expect(heading().textContent).toBe('¿En qué cancha?')
    expect(pushState).toHaveBeenCalledTimes(2)
    expect(replaceState).not.toHaveBeenCalled()
    const link = within(courtList('21:00')).getByRole('link')
    expect(link.getAttribute('href')).toBe(
      `/cancha-x/reservar?court=c1&date=${tomorrow}&time=21:00&dur=60`,
    )
  })

  it('"Volver" con una entrada empujada por la ficha hace history.back() y no toca la URL', async () => {
    atDay(today, { hora: '21:00' })
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ tgReserve: true })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('list', { name: 'Canchas libres a las 21:00' })

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

    expect(back).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
  })

  it('"Volver" tras entrar por un link reemplaza la URL por el paso anterior, sin salir del sitio', async () => {
    atDay(today, { hora: '21:00' })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('list', { name: 'Canchas libres a las 21:00' })

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

    expect(back).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.not.stringContaining('hora='))
    expect(heading().textContent).toBe('¿A qué hora?')
    // La hora que se había elegido sigue a la vista, elegida.
    expect(hour('21:00').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.not.stringContaining('date='))
    expect(heading().textContent).toBe('¿Qué día querés jugar?')
    // Y el día también.
    expect(dayRows()[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(dayRows()[1]!.getAttribute('aria-pressed')).toBe('false')
  })

  it('"Volver" en un paso 3 recargado cuya hora ya no existe (se ve el 2) va al paso 1, no al historial', async () => {
    atDay(today, { hora: '20:00' })
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ tgReserve: true })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('21:00')
    expect(heading().textContent).toBe('¿A qué hora?')

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

    // El historial volvería al paso 2, el mismo que ya se ve: "Volver" parecería no hacer nada.
    expect(back).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.not.stringContaining('date='),
    )
    expect(heading().textContent).toBe('¿Qué día querés jugar?')
  })

  it('el atrás del navegador (popstate) cambia de paso según la URL', async () => {
    atDay(today, { hora: '21:00' })
    const happyDom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('list', { name: 'Canchas libres a las 21:00' })

    happyDom.setURL(`http://localhost:3000/cancha-x?date=${today}`)
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(heading().textContent).toBe('¿A qué hora?')
    expect(hour('21:00').getAttribute('aria-pressed')).toBe('true')

    happyDom.setURL('http://localhost:3000/cancha-x')
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(heading().textContent).toBe('¿Qué día querés jugar?')

    happyDom.setURL(`http://localhost:3000/cancha-x?date=${tomorrow}&hora=21%3A00`)
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    await screen.findByRole('list', { name: 'Canchas libres a las 21:00' })
    expect(heading().textContent).toBe('¿En qué cancha?')
    happyDom.setURL('http://localhost:3000/')
  })

  it('el filtro de formato reemplaza la URL (no la empuja) y conserva la marca de la entrada', async () => {
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

  it('al avanzar, el foco va al título del paso nuevo y se anuncia', async () => {
    searchParamsRef.current = new URLSearchParams()
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('list', { name: 'Día' })
    // En la carga el foco no se roba.
    expect(document.activeElement).toBe(document.body)

    fireEvent.click(dayRows()[0]!)

    await waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(heading().getAttribute('tabindex')).toBe('-1')
    await findHour('18:00')
    expect(screen.getByRole('status').textContent).toBe(
      `Paso 2 de 3. ¿A qué hora? ${capitalizeFirst(dayLong(today))}: 2 horarios con lugar.`,
    )
  })
})

describe('ReserveSection: la lista de días', () => {
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
    const fetchMock = mockApi(() => 'fail', 'fail')
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    const region = screen.getByRole('region', { name: 'Reservá tu turno' })
    await waitFor(() => expect(region.getAttribute('data-state')).toBe('ready'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    for (const row of dayRows()) {
      expect(row.hasAttribute('disabled')).toBe(false)
      expect(row.textContent).not.toMatch(/Hay lugar|Completo|Sin horarios/)
    }
  })

  it('el estado de los días cuenta todas las canchas: el filtro de formato no se ve en el paso 1', async () => {
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

    // La F7 está ocupada pero la F5 no: el día tiene lugar y se puede elegir (el filtro está en el 2).
    await waitFor(() => expect(dayRows()[0]!.textContent).toContain('Hay lugar'))
    expect(dayRows()[0]!.hasAttribute('disabled')).toBe(false)
  })
})

describe('ReserveSection: la semana alimenta el paso 2', () => {
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

    fireEvent.click(dayRows()[1]!)

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
    fireEvent.click(await findHour('21:00'))

    const links = within(courtList('21:00')).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      `/cancha-x/reservar?court=c1&date=${today}&time=21:00&dur=60`,
      `/cancha-x/reservar?court=c3&date=${today}&time=21:00&dur=60`,
    ])
    expect(links[1]!.textContent).toContain('Cancha 3')
    expect(links[1]!.textContent).toContain('Fútbol 7')
    expect(links[1]!.textContent).toContain('18.000')
    expect(pushState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.stringContaining('hora=21%3A00'),
    )
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

    expect(within(courtList('21:00')).getAllByRole('link')).toHaveLength(n)
  })

  it('?hora= que no existe (o está completa) no elige nada y muestra el paso 2; una válida va al paso 3', async () => {
    atDay(today, { hora: '03:00' })
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    const first = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await findHour('18:00')
    expect(heading().textContent).toBe('¿A qué hora?')
    expect(screen.queryByRole('list', { name: /^Canchas libres/ })).toBeNull()
    first.unmount()

    // 19:00 existe pero está completa.
    atDay(today, { hora: '19:00' })
    const second = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await findHour('18:00')
    expect(heading().textContent).toBe('¿A qué hora?')
    expect(screen.queryByRole('list', { name: /^Canchas libres/ })).toBeNull()
    second.unmount()

    atDay(today, { hora: '18:00' })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    expect(await screen.findByRole('list', { name: 'Canchas libres a las 18:00' })).toBeTruthy()
    expect(heading().textContent).toBe('¿En qué cancha?')
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
    fireEvent.click(await findHour('21:00'))

    const link = within(courtList('21:00')).getByRole('link')
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//)
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain(
      'a las 21:00 (Cancha 1, Fútbol 5).',
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.textContent).toContain('WhatsApp')
    expect(link.getAttribute('href')).not.toContain('/reservar')
    expect(screen.getByText(/Tocá la cancha y le escribís al complejo\./)).toBeTruthy()
  })

  it('el filtro de formato deja solo las horas de ese formato, sin volver a pedir el día', async () => {
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

  it('con el filtro elegido, el link de cada cancha a confirmar lleva el formato; con "Todos", no', async () => {
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('19:00')], 7),
        court('c2', 'Cancha 2', [slot('19:00')], 5),
      ]),
    )
    const links = () =>
      within(courtList('19:00'))
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')!)

    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await findHour('19:00')
    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))
    fireEvent.click(await findHour('19:00'))
    expect(links()).toHaveLength(1)
    expect(links()[0]).toContain('/reservar?court=c1')
    expect(links()[0]).toContain('formato=7')
    cleanup()

    // Con "Todos" no viaja ningún formato.
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    fireEvent.click(await findHour('19:00'))
    expect(links()).toHaveLength(2)
    for (const href of links()) expect(href).not.toContain('formato')
  })

  it('con un solo formato no hay filtro de formato', async () => {
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('18:00')
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
    fireEvent.click(await findHour('21:00'))
    await screen.findByRole('list', { name: 'Canchas libres a las 21:00' })

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
    fireEvent.click(await findHour('21:00'))

    const list = await screen.findByRole('list', { name: 'Canchas libres a las 21:00' })
    expect(list.textContent).toContain('15.000')
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
    // Sale con push, al paso 2 de ese día.
    expect(pushState).toHaveBeenLastCalledWith(
      { tgReserve: true },
      '',
      expect.stringContaining(`date=${dayAfter}`),
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
    expect(screen.queryByRole('group', { name: 'Hora' })).toBeNull()
    fireEvent.click(button)
    await findHour('18:00')
    expect(
      screen.getByText(new RegExp(`^${capitalizeFirst(dayLong(addDays(today, 2)))} · Debajo`)),
    ).toBeTruthy()
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
  it('un role=status oculto anuncia el paso y, al elegir hora, las canchas libres', async () => {
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
    expect(status.textContent).toBe(
      `Paso 2 de 3. ¿A qué hora? ${capitalizeFirst(dayLong(today))}: 2 horarios con lugar.`,
    )

    fireEvent.click(hour('21:00'))
    expect(status.textContent).toBe('Paso 3 de 3. ¿En qué cancha? 21:00: 2 canchas libres.')
  })

  it('profile.viewed sale una vez por pestaña y complejo, con la primera carga de la semana', async () => {
    searchParamsRef.current = new URLSearchParams()
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))

    const first = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await waitFor(() => expect(trackMock).toHaveBeenCalledTimes(1))
    expect(trackMock).toHaveBeenCalledWith('cancha-x', false)

    // Cambiar de día y volver a montar en la misma pestaña no repite el evento.
    fireEvent.click(dayRows()[1]!)
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

  it('profile.viewed no sale si las horas no cargaron', async () => {
    mockApi(() => 'fail')
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await screen.findByRole('alert')
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('profile.viewed no sale si la semana del paso 1 falló', async () => {
    searchParamsRef.current = new URLSearchParams()
    mockApi(() => 'fail', 'fail')
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    const region = screen.getByRole('region', { name: 'Reservá tu turno' })
    await waitFor(() => expect(region.getAttribute('data-state')).toBe('ready'))
    expect(trackMock).not.toHaveBeenCalled()
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
/** Los pedidos de la semana que busca "otro día con lugar" (no la del paso 1, desde hoy). */
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

  it('pasada la medianoche, el día elegido que ya pasó vuelve al paso 1 y limpia la URL', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    // La URL (que el navegador ya había actualizado) también trae hora y formato: tampoco mandan,
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
    expect(courtList('21:00')).toBeTruthy()

    // Dos días después `today` ya es pasado: el reloj de la app avisa en el próximo minuto.
    vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000)
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    expect(heading().textContent).toBe('¿Qué día querés jugar?')
    expect(screen.queryByRole('list', { name: /^Canchas libres/ })).toBeNull()
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/cancha-x?utm=x')
    // Nada del día viejo se hereda al día nuevo: ni la hora ni el formato.
    const newToday = addDays(today, 2)
    expect(dayRows()[0]!.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(dayRows()[0]!)
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
    // Pedido 1 = la semana del paso 1; 2 = la búsqueda (falla); 3 = el reintento.
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
    // Solo la semana del paso 1; ninguna búsqueda después del último día.
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

    // Irse al paso 1 aborta la búsqueda en vuelo; ese rechazo no es un fallo de la búsqueda.
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(searchCalls(calls)[0]!.signal.aborted).toBe(true))
    await act(async () => {})

    fireEvent.click(dayRows()[0]!)
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
    expect(alone.className).not.toContain('warning')
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
    expect(scarce.className).toContain('bg-warning')
  })

  it('"Señando" no usa ámbar: borde punteado y texto normal', async () => {
    mockApi(heldDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    const held = await findHour('20:00')
    expect(held.className).toContain('border-dotted')
    expect(held.className).not.toContain('warning')
  })

  it('las horas son botones con aria-pressed (no radios) y la elegida lleva tilde', async () => {
    mockApi(freeDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    const btn = await findHour('18:00')
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('radio', { name: /^18:00/ })).toBeNull()
  })

  it('data-state: loading → ready, closed, error (y el paso 1)', async () => {
    const region = () => screen.getByRole('region', { name: 'Reservá tu turno' })
    mockApi(freeDay)
    const ready = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    expect(region().getAttribute('data-state')).toBe('loading')
    await findHour('18:00')
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
    const failed = render(
      <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
    )
    await waitFor(() => expect(region().getAttribute('data-state')).toBe('error'))
    failed.unmount()

    // Paso 1: loading hasta que la semana llegó.
    searchParamsRef.current = new URLSearchParams()
    mockApi(freeDay)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    expect(region().getAttribute('data-state')).toBe('loading')
    await waitFor(() => expect(region().getAttribute('data-state')).toBe('ready'))
    expect(region().getAttribute('aria-busy')).toBe('false')
  })

  it('sin anticipación, la pista dice que se reserva solo para hoy', async () => {
    searchParamsRef.current = new URLSearchParams()
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

describe('ReserveSection: scroll y transición entre pasos', () => {
  const scroll = vi.fn()
  const originalScroll = Element.prototype.scrollIntoView
  afterEach(async () => {
    // La alineación se repite en el próximo cuadro: que no caiga en el test siguiente.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    Element.prototype.scrollIntoView = originalScroll
  })
  /** `mobile`: debajo de lg; `reduce`: prefers-reduced-motion. */
  const media = ({ mobile, reduce }: { mobile: boolean; reduce: boolean }) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query.includes('reduced-motion')
            ? reduce
            : query.includes('max-width') && mobile,
        }) as MediaQueryList,
    )

  beforeEach(() => {
    scroll.mockClear()
    Element.prototype.scrollIntoView = scroll
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
  })

  it('en el celular, al avanzar alinea la sección al instante (la barra queda bajo el header)', async () => {
    media({ mobile: true, reduce: false })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await findHour('21:00'))

    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' })
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole('region', { name: 'Reservá tu turno' }))
  })

  it('al volver por el historial alinea otra vez en el próximo cuadro (el navegador restaura el scroll de esa entrada)', async () => {
    media({ mobile: true, reduce: false })
    atDay(today)
    const happyDom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    await findHour('21:00')

    happyDom.setURL('http://localhost:3000/cancha-x')
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(heading().textContent).toBe('¿Qué día querés jugar?')
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2))
    for (const ctx of scroll.mock.contexts) {
      expect(ctx).toBe(screen.getByRole('region', { name: 'Reservá tu turno' }))
    }
    happyDom.setURL('http://localhost:3000/')
  })

  it('desde lg (la reserva es la columna lateral) no mueve la página', async () => {
    media({ mobile: false, reduce: false })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)
    fireEvent.click(await findHour('21:00'))

    await screen.findByRole('list', { name: 'Canchas libres a las 21:00' })
    expect(scroll).not.toHaveBeenCalled()
  })

  it('un paso que ya viene en la URL no mueve la página al cargar', async () => {
    media({ mobile: true, reduce: false })
    atDay(today, { hora: '21:00' })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    await screen.findByRole('list', { name: 'Canchas libres a las 21:00' })
    expect(scroll).not.toHaveBeenCalled()
  })

  it('con View Transition: marca la dirección en <html> mientras dura y la limpia al terminar', async () => {
    media({ mobile: false, reduce: false })
    const seen: Array<string | undefined> = []
    const start = vi.fn((update: () => void) => {
      seen.push(document.documentElement.dataset.reserveStep)
      update()
      return { finished: Promise.resolve() }
    })
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    fireEvent.click(await findHour('21:00'))
    await waitFor(() => expect(document.documentElement.dataset.reserveStep).toBeUndefined())
    expect(start).toHaveBeenCalledTimes(1)
    expect(seen).toEqual(['forward'])
    expect(heading().textContent).toBe('¿En qué cancha?')

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(heading().textContent).toBe('¿A qué hora?'))
    expect(seen).toEqual(['forward', 'back'])
  })

  it('un doble toque cambia un solo paso: no empuja otra entrada ni vuelve dos veces', async () => {
    media({ mobile: false, reduce: false })
    // La View Transition aplica el paso recién cuando se llama a `run` (como el navegador, que
    // primero saca la foto de la pantalla vieja).
    let run = () => {}
    const start = vi.fn((update: () => void) => ({
      finished: new Promise<void>((resolve) => {
        run = () => {
          update()
          resolve()
        }
      }),
    }))
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ tgReserve: true })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    // Las horas siguen en pantalla mientras el paso cambia: el segundo toque cae sobre ellas.
    fireEvent.click(await findHour('21:00'))
    fireEvent.click(hour('21:00'))
    fireEvent.click(hour('18:00'))
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)

    await act(async () => run())
    expect(heading().textContent).toBe('¿En qué cancha?')

    // "Volver" espera el popstate: el segundo toque no retrocede otro paso.
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(back).toHaveBeenCalledTimes(1)

    // Una página que vuelve del bfcache a mitad de un "Volver" no queda trabada.
    act(() => {
      window.dispatchEvent(new Event('pageshow'))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(back).toHaveBeenCalledTimes(2)
  })

  it('con "reducir movimiento" cambia al instante, sin View Transition', async () => {
    media({ mobile: false, reduce: true })
    const start = vi.fn()
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
    render(<ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />)

    fireEvent.click(await findHour('21:00'))

    expect(start).not.toHaveBeenCalled()
    expect(heading().textContent).toBe('¿En qué cancha?')
  })
})

describe('ReserveSection: ronda 3 — frescura, día fuera de ventana y hora ocupada', () => {
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

  it('si la hora elegida se ocupa en el refresco, lo dice en lugar de la lista, lo anuncia y deja elegir otra', async () => {
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
    expect(await screen.findByText('Las 21:00 se ocuparon.')).toBeTruthy()

    expect(screen.getByRole('status').textContent).toContain(
      'Las 21:00 se ocuparon. Elegí otra hora.',
    )
    expect(screen.queryByRole('list', { name: /^Canchas libres/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Elegir otra hora' }))
    expect(heading().textContent).toBe('¿A qué hora?')
    expect(hour('18:00').getAttribute('aria-pressed')).toBe('false')
  })

  it('sin hora elegida antes (URL con una hora que no existe o completa) no dice "se ocuparon"', async () => {
    mockApi((date) => dayOf(date, [eveningCourt('c1', 'Cancha 1')]))
    for (const hora of ['03:00', '19:00']) {
      atDay(today, { hora })
      const view = render(
        <ReserveSection tenant={tenantWith()} formats={[5]} trackViewed={trackMock} />,
      )
      await findHour('18:00')
      expect(screen.queryByText(/se ocuparon/)).toBeNull()
      view.unmount()
    }
  })

  it('si la hora desaparece porque cambió el filtro de formato, no dice que se ocupó', async () => {
    atDay(today, { hora: '18:00' })
    mockApi((date) =>
      dayOf(date, [
        court('c1', 'Cancha 1', [slot('18:00')], 5),
        court('c2', 'Cancha 2', [slot('19:00')], 7),
      ]),
    )
    render(<ReserveSection tenant={tenantWith()} formats={[5, 7]} trackViewed={trackMock} />)
    await screen.findByRole('list', { name: 'Canchas libres a las 18:00' })
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 7' }))
    await waitFor(() => expect(hourButtons()).toHaveLength(1))

    expect(screen.queryByText(/se ocuparon/)).toBeNull()
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
    expect(pushState).toHaveBeenLastCalledWith(
      { tgReserve: true },
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
