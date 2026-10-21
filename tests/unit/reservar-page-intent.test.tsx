// @vitest-environment happy-dom
//
// La pantalla de confirmar cuando el jugador VUELVE del ingreso con un vínculo firmado: la page solo
// VERIFICA y decide qué mostrar (nunca confirma en el render ni en un GET); la confirmación la
// dispara el cliente con un envío del form y la action re-verifica. Cada degradación deja la
// pantalla normal con el botón visible y la razón en `checkout.intent_degraded`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { availabilityResponse, publicTenant } from '@/test/fixtures/public'
import {
  BOOKING_INTENT_COOKIE_NAME,
  signCookieBookingIntent,
  signEmailBookingIntent,
  type BookingIntentFields,
} from '@/shared/security/booking-intent'

const mocks = vi.hoisted(() => ({
  getPublicTenant: vi.fn(),
  getPublicAvailability: vi.fn(),
  extractAuthUser: vi.fn(),
  findOwnLiveBooking: vi.fn(),
  funnel: vi.fn(),
  warn: vi.fn(),
  // Las cookies que el navegador mandó (la del vínculo de Google, cuando corresponde).
  cookieJar: new Map<string, string>(),
}))

vi.mock('@/modules/tenants/public.service', () => ({
  getPublicTenant: mocks.getPublicTenant,
  getPublicAvailability: mocks.getPublicAvailability,
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: mocks.extractAuthUser }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0' }),
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookieJar.has(name) ? { name, value: mocks.cookieJar.get(name) } : undefined,
  }),
}))
// `notFound` y `redirect` se reemplazan para poder verlos; `unstable_rethrow` (la real) la usa el ingreso.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (url: string, type?: string) => {
    throw new Error(`NEXT_REDIRECT:${type ?? 'push'}:${url}`)
  },
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  withPlayerContext: async (_id: string, run: (tx: unknown) => unknown) => run({}),
}))
vi.mock('@/modules/bans/ban.service', () => ({ getActiveBanReason: vi.fn() }))
vi.mock('@/modules/bookings/booking.own', () => ({
  findOwnLiveBooking: mocks.findOwnLiveBooking,
}))
vi.mock('@/shared/observability', () => ({ track: { funnel: mocks.funnel } }))
vi.mock('@/shared/lib/logger', () => ({ logger: { warn: mocks.warn } }))
vi.mock('@/lib/seo/metadata', () => ({ buildMetadata: vi.fn() }))
// Las Server Actions son `'use server'` (arrastran request-context): acá solo se pasan por prop.
vi.mock('@/app/(public)/[slug]/reservar/actions', () => ({
  createBookingAndCheckout: vi.fn(),
  sendPlayerMagicLink: vi.fn(),
  startGoogleLoginFromReservar: vi.fn(),
}))

import ReservarPage from '@/app/(public)/[slug]/reservar/page'
import { createBookingAndCheckout } from '@/app/(public)/[slug]/reservar/actions'

const EMAIL = 'tomas@example.com'
const SLUG = 'complejo-fenix'
const MIN = 60_000
const DATE = '2026-03-14'
const availability = availabilityResponse()
const [cancha1] = availability.courts
// 20:00 está libre y 19:00 ocupado en la fixture.
const base = { court: cancha1!.id, date: DATE, time: '20:00', dur: '60' }
const TENANT_ID = publicTenant().id

async function renderPage(query: Record<string, string> = {}) {
  const ui = await ReservarPage({
    params: Promise.resolve({ slug: SLUG }),
    searchParams: Promise.resolve({ ...base, ...query }),
  })
  return render(ui)
}

// Lo que la page va a reservar con la fixture: sin `?pay=` en la URL no hay método (ya no se elige).
const fields = (over: Partial<BookingIntentFields> = {}): BookingIntentFields => ({
  slug: SLUG,
  court: cancha1!.id,
  date: DATE,
  time: '20:00',
  dur: 60,
  pay: null,
  ...over,
})
const emailToken = (over: Partial<BookingIntentFields> = {}, email = EMAIL, now = Date.now()) =>
  signEmailBookingIntent(fields(over), email, now)
const hiddenIntent = (root: HTMLElement) =>
  root.querySelector<HTMLInputElement>('form input[type="hidden"][name="booking_intent"]')?.value
const confirmando = () => screen.queryByText('Confirmando tu reserva…')
const HINT = 'Tocá Reservar para terminar.'
const hint = () => screen.queryByText(HINT)
/** Todo lo que la page le pasa al cliente (props de los elementos), sin las claves internas de React. */
const clientProps = (ui: unknown) => {
  const seen = new WeakSet<object>()
  return JSON.stringify(ui, (k, v: unknown) => {
    if (k.startsWith('_') || typeof v === 'function') return undefined
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return undefined
      seen.add(v)
    }
    return v
  })
}
const degraded = () =>
  mocks.funnel.mock.calls.filter((c) => c[0] === 'checkout.intent_degraded').map((c) => c[1])
const reason = (r: string) => [{ tenantId: TENANT_ID, reason: r }]
const h1 = () => screen.getByRole('heading', { level: 1 }).textContent

beforeEach(() => {
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
  mocks.cookieJar.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  mocks.findOwnLiveBooking.mockResolvedValue(null)
  mocks.getPublicAvailability.mockResolvedValue(availability)
  mocks.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'p1', email: EMAIL })
  mocks.getPublicTenant.mockResolvedValue(publicTenant({ requiresDeposit: false }))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ReservarPage — confirmación sola', () => {
  it('con un vínculo válido, sin seña y con el turno libre: confirma sola y deja el botón visible', async () => {
    const token = emailToken()
    const { container } = await renderPage({ booking_intent: token })

    expect(hiddenIntent(container)).toBe(token)
    await waitFor(() => expect(confirmando()?.getAttribute('role')).toBe('status'))
    expect(screen.getByRole('button', { name: /Reservar|Procesando/ })).toBeTruthy()
    await waitFor(() => expect(createBookingAndCheckout).toHaveBeenCalledTimes(1))
    expect(degraded()).toEqual([])
    expect(hint()).toBeNull()
  })

  it('la page NUNCA confirma: armar la pantalla (un GET) no llama a la action', async () => {
    const ui = await ReservarPage({
      params: Promise.resolve({ slug: SLUG }),
      searchParams: Promise.resolve({ ...base, booking_intent: emailToken() }),
    })
    expect(ui).toBeTruthy()
    expect(createBookingAndCheckout).not.toHaveBeenCalled()
  })

  it('el vínculo de Google (cookie, mismo navegador) también confirma sola', async () => {
    mocks.cookieJar.set(BOOKING_INTENT_COOKIE_NAME, signCookieBookingIntent(fields()))
    const { container } = await renderPage()

    // El form lleva el marcador: la action lee la cookie ella misma.
    expect(hiddenIntent(container)).toBe('cookie')
    await waitFor(() => expect(confirmando()).toBeTruthy())
    await waitFor(() => expect(createBookingAndCheckout).toHaveBeenCalledTimes(1))
    expect(hint()).toBeNull()
  })

  it('la cookie HttpOnly no se copia al cliente: ni al HTML ni a los props', async () => {
    const token = signCookieBookingIntent(fields())
    const [payload, firma] = token.split('.')
    mocks.cookieJar.set(BOOKING_INTENT_COOKIE_NAME, token)
    const ui = await ReservarPage({
      params: Promise.resolve({ slug: SLUG }),
      searchParams: Promise.resolve({ ...base }),
    })
    const { container } = render(ui)

    for (const rastro of [token, payload!, firma!]) {
      expect(clientProps(ui)).not.toContain(rastro)
      expect(container.innerHTML).not.toContain(rastro)
    }
    expect(clientProps(ui)).toContain('"autoConfirmToken":"cookie"')
  })

  it('el vínculo del mail sí viaja en el form: ya está en la URL', async () => {
    const token = emailToken()
    mocks.cookieJar.set(BOOKING_INTENT_COOKIE_NAME, signCookieBookingIntent(fields()))
    const { container } = await renderPage({ booking_intent: token })
    expect(hiddenIntent(container)).toBe(token)
  })

  it('con el pay de la URL: el vínculo tiene que traer el mismo', async () => {
    const ok = await renderPage({
      pay: 'transfer',
      booking_intent: emailToken({ pay: 'transfer' }),
    })
    expect(confirmando()).toBeTruthy()
    ok.unmount()
    window.sessionStorage.clear()

    const otro = await renderPage({ pay: 'transfer', booking_intent: emailToken({ pay: 'cash' }) })
    expect(hiddenIntent(otro.container)).toBeUndefined()
    expect(degraded()).toEqual(reason('fields_mismatch'))
  })

  it('una visita normal (sin vínculo) no confirma ni registra nada', async () => {
    const { container } = await renderPage()

    expect(hiddenIntent(container)).toBeUndefined()
    expect(confirmando()).toBeNull()
    expect(hint()).toBeNull()
    expect(degraded()).toEqual([])
    expect(createBookingAndCheckout).not.toHaveBeenCalled()
  })
})

describe('ReservarPage — degrada a la pantalla normal, con el botón, y deja la razón', () => {
  // Con un vínculo que no valió la pantalla pide tocar el botón; con seña no dice nada nuevo.
  const expectNormal = (
    container: HTMLElement,
    button: string | RegExp = 'Reservar',
    withHint = true,
  ) => {
    expect(hiddenIntent(container)).toBeUndefined()
    expect(confirmando()).toBeNull()
    expect(hint() !== null).toBe(withHint)
    expect(screen.getByRole('button', { name: button })).toBeTruthy()
    expect(createBookingAndCheckout).not.toHaveBeenCalled()
  }

  it('con seña: el jugador toca "Pagar seña" (un toque)', async () => {
    mocks.getPublicTenant.mockResolvedValue(
      publicTenant({ requiresDeposit: true, depositPercentage: 30 }),
    )
    const { container } = await renderPage({ booking_intent: emailToken() })
    expectNormal(container, /^Pagar seña/, false)
    expect(degraded()).toEqual(reason('deposit'))
  })

  it('con seña y un vínculo que ni vale: tampoco hay línea nueva (el jugador ya sabe que paga)', async () => {
    mocks.getPublicTenant.mockResolvedValue(
      publicTenant({ requiresDeposit: true, depositPercentage: 30 }),
    )
    const { container } = await renderPage({ booking_intent: 'basura' })
    expectNormal(container, /^Pagar seña/, false)
    expect(degraded()).toEqual(reason('invalid'))
  })

  it('un vínculo de otro email (el mail lo abrió otra persona)', async () => {
    const { container } = await renderPage({ booking_intent: emailToken({}, 'otra@example.com') })
    expectNormal(container)
    expect(degraded()).toEqual(reason('email_mismatch'))
  })

  it('un vínculo vencido', async () => {
    const { container } = await renderPage({
      booking_intent: emailToken({}, EMAIL, Date.now() - 61 * MIN),
    })
    expectNormal(container)
    expect(degraded()).toEqual(reason('expired'))
  })

  it('un vínculo de otro turno', async () => {
    const { container } = await renderPage({ booking_intent: emailToken({ time: '19:00' }) })
    expectNormal(container)
    expect(degraded()).toEqual(reason('fields_mismatch'))
  })

  it('un vínculo ilegible', async () => {
    const { container } = await renderPage({ booking_intent: 'basura' })
    expectNormal(container)
    expect(degraded()).toEqual(reason('invalid'))
  })

  it('un vínculo alterado', async () => {
    const [payload] = emailToken().split('.')
    const { container } = await renderPage({ booking_intent: `${payload}.firma-falsa` })
    expectNormal(container)
    expect(degraded()).toHaveLength(1)
  })

  it('una cookie de Google de otro turno', async () => {
    mocks.cookieJar.set(
      BOOKING_INTENT_COOKIE_NAME,
      signCookieBookingIntent(fields({ time: '19:00' })),
    )
    const { container } = await renderPage()
    expectNormal(container)
    expect(degraded()).toEqual(reason('fields_mismatch'))
  })

  it('un vínculo de mail puesto en la cookie no sirve (otro canal)', async () => {
    mocks.cookieJar.set(BOOKING_INTENT_COOKIE_NAME, emailToken())
    const { container } = await renderPage()
    expectNormal(container)
    expect(degraded()).toHaveLength(1)
  })

  it('sin sesión: el ingreso de siempre, sin señal ni confirmación', async () => {
    mocks.extractAuthUser.mockResolvedValue(null)
    await renderPage({ booking_intent: emailToken() })
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    expect(await screen.findByRole('heading', { name: 'Entrá para reservar' })).toBeTruthy()
    expect(confirmando()).toBeNull()
    expect(degraded()).toEqual([])
  })
})

describe('ReservarPage — el turno ocupado', () => {
  const taken = { time: '19:00' }
  const tokenOfTaken = () => emailToken({ time: '19:00' })

  it.each([
    ['confirmada', 'confirmed', '/reserva/b7/exito'],
    ['esperando la seña', 'pending_payment', '/reserva/b7/pendiente'],
  ])('si es MI reserva %s: va a su pantalla, reemplazando la entrada', async (_n, status, url) => {
    mocks.findOwnLiveBooking.mockResolvedValue({ id: 'b7', status })

    await expect(renderPage(taken)).rejects.toThrow(`NEXT_REDIRECT:replace:${url}`)
    expect(mocks.findOwnLiveBooking).toHaveBeenCalledWith(expect.anything(), {
      playerId: 'p1',
      courtId: cancha1!.id,
      date: DATE,
      timeStart: '19:00',
    })
  })

  it('si la búsqueda de "mi reserva" falla: cae al cartel de siempre Y la falla queda registrada', async () => {
    mocks.findOwnLiveBooking.mockRejectedValue(new Error('connection reset'))

    await renderPage(taken)

    expect(h1()).toBe('Ese turno ya no está disponible')
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    const [message, meta] = mocks.warn.mock.calls[0]!
    expect(message).toBe('reservar.own_booking_lookup_failed')
    expect(meta).toMatchObject({ module: 'reservar', error: 'connection reset' })
    // Sin datos de la persona.
    expect(JSON.stringify(mocks.warn.mock.calls[0])).not.toContain(EMAIL)
  })

  it('si es de otra persona y no vino ningún vínculo: "ya no está disponible", sin señal', async () => {
    await renderPage(taken)
    expect(h1()).toBe('Ese turno ya no está disponible')
    expect(degraded()).toEqual([])
  })

  it('sin sesión no se pregunta de quién es', async () => {
    mocks.extractAuthUser.mockResolvedValue(null)
    await renderPage(taken)
    expect(mocks.findOwnLiveBooking).not.toHaveBeenCalled()
    expect(h1()).toBe('Ese turno ya no está disponible')
  })

  it('con un vínculo válido: "se ocupó mientras entrabas" y la salida al mismo día', async () => {
    await renderPage({ ...taken, formato: '5', booking_intent: tokenOfTaken() })

    expect(h1()).toBe('Ese turno se ocupó mientras entrabas')
    const salida = screen.getByRole('link', { name: 'Ver otras horas del sábado 14 de marzo' })
    // La ficha del día y el formato, SIN la hora que ya no está.
    expect(salida.getAttribute('href')).toBe(`/${SLUG}?date=${DATE}&formato=5`)
    expect(degraded()).toEqual(reason('taken'))
  })

  it('lo mismo si la action rebotó con taken_on_return', async () => {
    await renderPage({ ...taken, error: 'taken_on_return' })

    expect(h1()).toBe('Ese turno se ocupó mientras entrabas')
    expect(
      screen
        .getByRole('link', { name: 'Ver otras horas del sábado 14 de marzo' })
        .getAttribute('href'),
    ).toBe(`/${SLUG}?date=${DATE}`)
  })

  it('con un vínculo inválido: el cartel de siempre, con la razón del vínculo (no "taken")', async () => {
    await renderPage({ ...taken, booking_intent: `${tokenOfTaken().split('.')[0]}.firma-falsa` })

    expect(h1()).toBe('Ese turno ya no está disponible')
    expect(degraded()).toHaveLength(1)
    expect(degraded()[0]).not.toMatchObject({ reason: 'taken' })
  })

  it('taken_on_return con el turno libre otra vez: la pantalla normal, para reintentar', async () => {
    const { container } = await renderPage({ error: 'taken_on_return' })
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeTruthy()
    expect(hiddenIntent(container)).toBeUndefined()
  })
})
