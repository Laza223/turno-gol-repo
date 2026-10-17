import { beforeEach, describe, expect, it, vi } from 'vitest'

// La reserva que se confirma sola al volver del ingreso, del lado del servidor: los emisores del
// vínculo firmado (magic link y Google), y la action que lo re-verifica y es idempotente.

const {
  signInWithGooglePlayer,
  signInWithPlayerMagicLink,
  redirect,
  cookieJar,
  cookieSet,
  cookieDelete,
  user,
  tenantRow,
  createOnlineBooking,
  createDepositPayment,
  findOwnLiveBooking,
  funnel,
  warn,
  enforce,
  captureMessage,
} = vi.hoisted(() => ({
  signInWithGooglePlayer: vi.fn(),
  signInWithPlayerMagicLink: vi.fn(),
  redirect: vi.fn((url: string, type?: string) => {
    throw new Error(`NEXT_REDIRECT:${type ?? 'push'}:${url}`)
  }),
  // Lo que el navegador mandó: la cookie del vínculo de Google cuando corresponde.
  cookieJar: new Map<string, string>(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  user: vi.fn(),
  tenantRow: { current: null as unknown },
  createOnlineBooking: vi.fn(),
  createDepositPayment: vi.fn(),
  findOwnLiveBooking: vi.fn(),
  funnel: vi.fn(),
  warn: vi.fn(),
  enforce: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  captureMessage: vi.fn(),
}))

vi.mock('@/modules/auth/auth.service', () => ({
  signInWithGooglePlayer,
  signInWithPlayerMagicLink,
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: user }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ origin: 'http://localhost:3000' }),
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: cookieSet,
    delete: cookieDelete,
  }),
}))
vi.mock('next/navigation', () => ({ redirect, RedirectType: { push: 'push', replace: 'replace' } }))
vi.mock('@/shared/rate-limit', () => ({ enforce, parseClientIp: () => '1.1.1.1' }))
vi.mock('@/shared/db/client', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [tenantRow.current] }) }) }),
  }),
  withPlayerContext: async (_playerId: string, run: (tx: unknown) => unknown) =>
    run({ execute: vi.fn() }),
  withTenantContext: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.service', () => ({ createOnlineBooking }))
vi.mock('@/modules/bookings/booking.own', () => ({ findOwnLiveBooking }))
vi.mock('@/modules/payments/payment.service', () => ({ createDepositPayment }))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: () => ({}) }))
vi.mock('@/shared/observability', () => ({ track: { funnel } }))
vi.mock('@/shared/lib/logger', () => ({ logger: { warn } }))
vi.mock('@/lib/sentry', () => ({ captureMessage }))

import {
  createBookingAndCheckout,
  sendPlayerMagicLink,
  startGoogleLoginFromReservar,
} from '@/app/(public)/[slug]/reservar/actions'
import {
  BookingValidationError,
  BookingDateOutOfRangeError,
  CourtOfflineError,
  PlayerBannedError,
  SlotTakenError,
  TooManyActiveHoldsError,
} from '@/modules/bookings/booking.errors'
import {
  BOOKING_INTENT_COOKIE_NAME,
  signCookieBookingIntent,
  signEmailBookingIntent,
  verifyCookieBookingIntent,
  verifyEmailBookingIntent,
  type BookingIntentFields,
} from '@/shared/security/booking-intent'

const COURT = '2f6c0f6e-1a3b-4c5d-8e9f-0a1b2c3d4e5f'
const EMAIL = 'tomas@example.com'
const FIELDS: BookingIntentFields = {
  slug: 'club-x',
  court: COURT,
  date: '2099-01-02',
  time: '21:00',
  dur: 60,
  pay: 'transfer',
}
const BASE = `/club-x/reservar?court=${COURT}&date=2099-01-02&time=21:00&dur=60`
const NEXT = `${BASE}&formato=5&pay=transfer`
const idle = { status: 'idle' } as const

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

/** El `next` que viajó dentro del `redirectTo` del callback. */
const nextOf = (redirectTo: string) => new URL(redirectTo).searchParams.get('next') as string

/** El mensaje del redirect que tiró la action: `NEXT_REDIRECT:<push|replace>:<url>`. */
async function redirected(run: Promise<unknown>) {
  const outcome = await run.then(
    () => null,
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  )
  const match = /^NEXT_REDIRECT:(push|replace):(.*)$/s.exec(outcome ?? '')
  if (!match) throw new Error(`la action no redirigió: ${outcome}`)
  return { type: match[1], url: match[2] }
}

beforeEach(() => {
  vi.clearAllMocks()
  cookieJar.clear()
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
  signInWithGooglePlayer.mockResolvedValue({ url: 'https://accounts.google.com/o' })
  signInWithPlayerMagicLink.mockResolvedValue({ ok: true })
})

describe('sendPlayerMagicLink — el vínculo viaja en el next del mail', () => {
  const ok = { terms: 'on', firstName: 'Tomás', email: EMAIL, next: NEXT }
  const sentNext = () => nextOf(signInWithPlayerMagicLink.mock.calls[0]![1] as string)

  it('suma booking_intent, ligado al email que se escribió', async () => {
    await sendPlayerMagicLink(idle, fd({ ...ok, email: '  Tomas@Example.COM ' }))

    const next = new URL(sentNext(), 'http://x')
    expect(next.pathname).toBe('/club-x/reservar')
    // El resto del next es lo de siempre, en el mismo orden.
    expect(`${next.pathname}${next.search}`.replace(/&booking_intent=.*$/, '')).toBe(NEXT)
    const token = next.searchParams.get('booking_intent')!
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS)).toEqual({ ok: true })
    // Con otro email no vale.
    expect(verifyEmailBookingIntent(token, 'otra@example.com', FIELDS).ok).toBe(false)
  })

  it('el next se rearma desde los campos validados: lo que sobra o no valida se descarta', async () => {
    const dirty = `${BASE}&formato=99&pay=bitcoin&utm=ig&booking_intent=forjado&x=%3Cscript%3E`
    await sendPlayerMagicLink(idle, fd({ ...ok, next: dirty }))

    const next = new URL(sentNext(), 'http://x')
    expect([...next.searchParams.keys()]).toEqual([
      'court',
      'date',
      'time',
      'dur',
      'booking_intent',
    ])
    const token = next.searchParams.get('booking_intent')!
    expect(token).not.toBe('forjado')
    // Sin método de pago válido, el vínculo se firma sin él.
    expect(verifyEmailBookingIntent(token, EMAIL, { ...FIELDS, pay: null })).toEqual({ ok: true })
  })

  it.each([
    ['una cancha que no es UUID', `/club-x/reservar?court=c1&date=2099-01-02&time=21:00&dur=60`],
    ['una fecha inexistente', `/club-x/reservar?court=${COURT}&date=2099-13-45&time=21:00&dur=60`],
    ['una hora mal escrita', `/club-x/reservar?court=${COURT}&date=2099-01-02&time=9:00&dur=60`],
    ['una duración que no es la del turno', `${BASE.replace('dur=60', 'dur=120')}`],
    ['sin cancha', `/club-x/reservar?date=2099-01-02&time=21:00&dur=60`],
    ['basura', '/club-x/reservar?%%%'],
    // Pasan `isBookingPath` pero el primer segmento no es un slug de complejo: no se firma por ellos.
    ['un slug con mayúsculas y guion bajo', BASE.replace('/club-x/', '/Club_X/')],
    ['un slug que empieza con guion', BASE.replace('/club-x/', '/-club/')],
    ['un slug con %2F', BASE.replace('/club-x/', '/club%2Fx/')],
    ['un slug con punto', BASE.replace('/club-x/', '/club.x/')],
  ])('con %s el next va como hoy, sin firmar nada', async (_name, next) => {
    await sendPlayerMagicLink(idle, fd({ ...ok, next }))

    expect(sentNext()).toBe(next)
    expect(sentNext()).not.toContain('booking_intent')
  })

  it.each([
    '/mis-reservas',
    '/club-x',
    '//evil.com/club-x/reservar',
    'https://evil.com',
    // Una query que contiene "/reservar" no hace de esto una reserva, ni una subruta de la pantalla.
    `/mis-reservas?next=${BASE}`,
    `/x?a=${BASE}`,
    `/club-x/reservar/extra?court=${COURT}&date=2099-01-02&time=21:00&dur=60`,
  ])('un next que no es de reserva (%j) no firma nada', async (next) => {
    await sendPlayerMagicLink(idle, fd({ ...ok, next }))
    expect(sentNext()).not.toContain('booking_intent')
    expect(sentNext().startsWith('/')).toBe(true)
    expect(sentNext().startsWith('//')).toBe(false)
  })

  it('si no se puede firmar (sin secreto), el mail sale igual y el jugador confirma a mano', async () => {
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', '')

    const result = await sendPlayerMagicLink(idle, fd(ok))

    expect(result).toMatchObject({ status: 'sent' })
    expect(sentNext()).toBe(NEXT)
    // La confirmación sola se apagó entera y la pantalla sigue prometiéndola: tiene que verse.
    expect(captureMessage).toHaveBeenCalledWith(
      'reservar: no se pudo firmar el vínculo de la reserva',
      'warning',
    )
  })
})

describe('startGoogleLoginFromReservar — el vínculo viaja en una cookie', () => {
  const intentCookie = () =>
    cookieSet.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((c) => c.name === BOOKING_INTENT_COOKIE_NAME)

  it('con la casilla: cookie HttpOnly firmada, y el next va SIN token', async () => {
    await expect(
      startGoogleLoginFromReservar(idle, fd({ next: NEXT, terms: 'on' })),
    ).rejects.toThrow('NEXT_REDIRECT:push:https://accounts.google.com/o')

    const cookie = intentCookie()!
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
      secure: false,
    })
    expect(verifyCookieBookingIntent(cookie.value as string, FIELDS)).toEqual({ ok: true })
    // No sirve como enlace de mail.
    expect(verifyEmailBookingIntent(cookie.value as string, EMAIL, FIELDS).ok).toBe(false)
    expect(signInWithGooglePlayer).toHaveBeenCalledWith(
      `http://localhost:3000/api/auth/callback?next=${encodeURIComponent(NEXT)}`,
    )
  })

  it('en producción la cookie es secure', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(
      startGoogleLoginFromReservar(idle, fd({ next: NEXT, terms: 'on' })),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(intentCookie()).toMatchObject({ secure: true })
  })

  it('sin la casilla borra la cookie vieja y no setea ninguna', async () => {
    const result = await startGoogleLoginFromReservar(idle, fd({ next: NEXT }))

    expect(result).toMatchObject({ status: 'error', field: 'terms' })
    expect(cookieDelete).toHaveBeenCalledWith(BOOKING_INTENT_COOKIE_NAME)
    expect(intentCookie()).toBeUndefined()
  })

  it.each(['/mis-reservas', `/club-x/reservar?court=c1&date=2099-01-02&time=21:00&dur=60`])(
    'un next sin reserva válida (%j) no deja una cookie vieja viva',
    async (next) => {
      await expect(startGoogleLoginFromReservar(idle, fd({ next, terms: 'on' }))).rejects.toThrow(
        'NEXT_REDIRECT',
      )

      expect(intentCookie()).toBeUndefined()
      expect(cookieDelete).toHaveBeenCalledWith(BOOKING_INTENT_COOKIE_NAME)
    },
  )
})

describe('createBookingAndCheckout — la reserva que se confirma sola', () => {
  const turno = { slug: 'club-x', court: COURT, date: '2099-01-02', time: '21:00', dur: '60' }
  const form = (over: Record<string, string> = {}) => fd({ ...turno, pay: 'transfer', ...over })
  const tenant = (settings: Record<string, unknown> = {}) => ({
    id: 't1',
    status: 'active',
    mpAccessToken: 'token-del-complejo',
    settings: {
      requires_deposit: false,
      deposit_percentage: 0,
      accepts_cash: true,
      accepts_transfer: true,
      booking_advance_days: 6,
      ...settings,
    },
  })
  const emailToken = (over: Partial<BookingIntentFields> = {}, email = EMAIL, now = Date.now()) =>
    signEmailBookingIntent({ ...FIELDS, ...over }, email, now)
  const events = () => funnel.mock.calls.map((c) => [c[0], c[1]])

  beforeEach(() => {
    user.mockResolvedValue({ type: 'player', playerId: 'p1', email: EMAIL })
    tenantRow.current = tenant()
    createOnlineBooking.mockResolvedValue({ id: 'b1', status: 'confirmed' })
    createDepositPayment.mockResolvedValue({ initPoint: 'https://mp.test/pagar' })
    findOwnLiveBooking.mockResolvedValue(null)
  })

  it('vínculo válido sin seña: crea la reserva, lo cuenta y va a /exito sin dejar la pantalla en el historial', async () => {
    const out = await redirected(createBookingAndCheckout(form({ booking_intent: emailToken() })))

    expect(out).toEqual({ type: 'replace', url: '/reserva/b1/exito' })
    expect(createOnlineBooking).toHaveBeenCalledTimes(1)
    expect(events()).toEqual([['checkout.intent_confirmed', { tenantId: 't1' }]])
  })

  it('el vínculo de Google (cookie) también confirma, y la cookie se borra al usarla', async () => {
    cookieJar.set(BOOKING_INTENT_COOKIE_NAME, signCookieBookingIntent(FIELDS))

    const out = await redirected(createBookingAndCheckout(form()))

    expect(out.url).toBe('/reserva/b1/exito')
    expect(events()).toEqual([['checkout.intent_confirmed', { tenantId: 't1' }]])
    expect(cookieDelete).toHaveBeenCalledWith(BOOKING_INTENT_COOKIE_NAME)
  })

  it('sin ningún vínculo (envío manual) no registra nada', async () => {
    await redirected(createBookingAndCheckout(form()))
    expect(funnel).not.toHaveBeenCalled()
    expect(cookieDelete).not.toHaveBeenCalled()
  })

  describe('con seña no hay confirmación sola', () => {
    const conSena = () => {
      tenantRow.current = tenant({ requires_deposit: true, deposit_percentage: 30 })
      createOnlineBooking.mockResolvedValue({ id: 'b2', status: 'pending_payment' })
    }
    const backToSena = `${BASE}&pay=mercadopago`

    it.each([
      ['el vínculo del mail', () => emailToken({ pay: 'mercadopago' })],
      ['el marcador de la cookie de Google', () => 'cookie'],
      ['un valor cualquiera', () => 'basura'],
    ])(
      'un auto-envío (el form trae booking_intent: %s) no crea nada: vuelve a la pantalla',
      async (_n, value) => {
        conSena()
        cookieJar.set(
          BOOKING_INTENT_COOKIE_NAME,
          signCookieBookingIntent({ ...FIELDS, pay: 'mercadopago' }),
        )

        const out = await redirected(
          createBookingAndCheckout(form({ pay: 'mercadopago', booking_intent: value() })),
        )

        // Ni la reserva ni el pago: el jugador toca "Pagar la seña" él mismo.
        expect(out).toEqual({ type: 'replace', url: backToSena })
        expect(createOnlineBooking).not.toHaveBeenCalled()
        expect(createDepositPayment).not.toHaveBeenCalled()
        expect(events()).toEqual([
          ['checkout.intent_degraded', { tenantId: 't1', reason: 'deposit' }],
        ])
        // La cookie se gasta igual: la pantalla de vuelta no la vuelve a ver.
        expect(cookieDelete).toHaveBeenCalledWith(BOOKING_INTENT_COOKIE_NAME)
      },
    )

    it('el toque manual de "Pagar la seña" (el form NO trae el campo) sigue igual que hoy', async () => {
      conSena()

      const out = await redirected(createBookingAndCheckout(form({ pay: 'mercadopago' })))

      expect(out).toEqual({ type: 'replace', url: 'https://mp.test/pagar' })
      expect(createOnlineBooking).toHaveBeenCalledTimes(1)
      expect(createDepositPayment).toHaveBeenCalledTimes(1)
      expect(funnel).not.toHaveBeenCalled()
    })

    it('con la cookie de Google viva pero sin el campo: es el toque manual, y registra "deposit"', async () => {
      conSena()
      cookieJar.set(
        BOOKING_INTENT_COOKIE_NAME,
        signCookieBookingIntent({ ...FIELDS, pay: 'mercadopago' }),
      )

      const out = await redirected(createBookingAndCheckout(form({ pay: 'mercadopago' })))

      expect(out).toEqual({ type: 'replace', url: 'https://mp.test/pagar' })
      expect(createDepositPayment).toHaveBeenCalledTimes(1)
      expect(events()).toEqual([
        ['checkout.intent_degraded', { tenantId: 't1', reason: 'deposit' }],
      ])
    })
  })

  describe('el marcador "cookie": la action lee y verifica la cookie ella misma', () => {
    it('con el marcador y la cookie válida confirma, y la cookie se borra', async () => {
      cookieJar.set(BOOKING_INTENT_COOKIE_NAME, signCookieBookingIntent(FIELDS))

      const out = await redirected(createBookingAndCheckout(form({ booking_intent: 'cookie' })))

      expect(out).toEqual({ type: 'replace', url: '/reserva/b1/exito' })
      expect(events()).toEqual([['checkout.intent_confirmed', { tenantId: 't1' }]])
      expect(cookieDelete).toHaveBeenCalledWith(BOOKING_INTENT_COOKIE_NAME)
    })

    it('el marcador sin cookie (venció en el medio) no confirma "sola": es un envío manual y deja la razón', async () => {
      const out = await redirected(createBookingAndCheckout(form({ booking_intent: 'cookie' })))

      expect(out.url).toBe('/reserva/b1/exito')
      expect(events()).toEqual([
        ['checkout.intent_degraded', { tenantId: 't1', reason: 'invalid' }],
      ])
    })

    it('el marcador con la cookie de otro turno tampoco confirma sola', async () => {
      cookieJar.set(
        BOOKING_INTENT_COOKIE_NAME,
        signCookieBookingIntent({ ...FIELDS, time: '20:00' }),
      )

      await redirected(createBookingAndCheckout(form({ booking_intent: 'cookie' })))

      expect(events()).toEqual([
        ['checkout.intent_degraded', { tenantId: 't1', reason: 'fields_mismatch' }],
      ])
    })
  })

  const MIN = 60_000
  it.each([
    ['de otro email', () => emailToken({}, 'otra@example.com'), 'email_mismatch'],
    ['vencido', () => emailToken({}, EMAIL, Date.now() - 61 * MIN), 'expired'],
    ['de otro turno', () => emailToken({ time: '20:00' }), 'fields_mismatch'],
    ['alterado', () => `${emailToken().split('.')[0]}.firma-falsa`, 'email_mismatch'],
    ['ilegible', () => 'basura', 'invalid'],
  ])(
    'un vínculo %s no frena al jugador: reserva igual y registra "%s"',
    async (_n, token, reason) => {
      const out = await redirected(createBookingAndCheckout(form({ booking_intent: token() })))

      expect(out.url).toBe('/reserva/b1/exito')
      expect(createOnlineBooking).toHaveBeenCalledTimes(1)
      expect(events()).toEqual([['checkout.intent_degraded', { tenantId: 't1', reason }]])
    },
  )

  it('no hay PII en los eventos: ni email ni token', async () => {
    await redirected(createBookingAndCheckout(form({ booking_intent: emailToken() })))
    await redirected(createBookingAndCheckout(form({ booking_intent: 'basura' })))
    expect(funnel).toHaveBeenCalledTimes(2)
    const dump = JSON.stringify(funnel.mock.calls)
    expect(dump).not.toContain('tomas')
    expect(dump).not.toContain('basura')
    expect(dump).not.toContain('p1')
  })

  describe('idempotencia: el turno ocupado puede ser el propio', () => {
    beforeEach(() => {
      createOnlineBooking.mockRejectedValue(new SlotTakenError())
    })

    it.each([
      ['confirmada', 'confirmed', '/reserva/b9/exito'],
      ['esperando la seña', 'pending_payment', '/reserva/b9/pendiente'],
    ])('si la reserva %s es del jugador, va a su pantalla (replace)', async (_n, status, url) => {
      findOwnLiveBooking.mockResolvedValue({ id: 'b9', status })

      const out = await redirected(createBookingAndCheckout(form()))

      expect(out).toEqual({ type: 'replace', url })
      expect(findOwnLiveBooking).toHaveBeenCalledWith(expect.anything(), {
        playerId: 'p1',
        courtId: COURT,
        date: '2099-01-02',
        timeStart: '21:00',
      })
      expect(funnel).not.toHaveBeenCalled()
    })

    it('si es de otra persona y vino con un vínculo válido: "se ocupó mientras entrabas"', async () => {
      const out = await redirected(createBookingAndCheckout(form({ booking_intent: emailToken() })))

      expect(out).toEqual({
        type: 'replace',
        url: `${BASE}&pay=transfer&error=taken_on_return`,
      })
      expect(funnel).not.toHaveBeenCalled()
    })

    it.each([
      ['sin vínculo', {}],
      ['con un vínculo inválido', { booking_intent: 'basura' }],
    ])('si es de otra persona %s: como hoy, vuelve al confirmar', async (_n, over) => {
      const out = await redirected(createBookingAndCheckout(form(over)))
      expect(out).toEqual({ type: 'replace', url: `${BASE}&pay=transfer` })
    })

    it('si no se puede averiguar de quién es, no rompe: vuelve como hoy, y la falla se registra', async () => {
      findOwnLiveBooking.mockRejectedValue(new Error('db caída'))
      const out = await redirected(createBookingAndCheckout(form()))
      expect(out).toEqual({ type: 'replace', url: `${BASE}&pay=transfer` })

      expect(warn).toHaveBeenCalledTimes(1)
      const [message, meta] = warn.mock.calls[0]!
      expect(message).toBe('reservar.own_booking_lookup_failed')
      expect(meta).toMatchObject({ module: 'reservar', error: 'db caída' })
      // Sin datos de la persona.
      expect(JSON.stringify(warn.mock.calls[0])).not.toContain('tomas')
    })
  })

  describe('todos los redirect son replace: Atrás no vuelve a esta pantalla', () => {
    const rebote = (error: Error) => () => createOnlineBooking.mockRejectedValue(error)
    const cases: Array<[string, () => void, () => FormData, string]> = [
      ['fecha inválida', () => {}, () => form({ date: '2099-13-45' }), 'error=invalid_date'],
      ['sin sesión', () => user.mockResolvedValue(null), () => form(), `${BASE}&pay=transfer`],
      [
        'rate limit por IP',
        () => enforce.mockResolvedValueOnce({ ok: false }),
        () => form(),
        'error=rate_limited',
      ],
      [
        'rate limit por jugador',
        () => enforce.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false }),
        () => form(),
        'error=rate_limited',
      ],
      ['complejo inexistente', () => (tenantRow.current = undefined), () => form(), '/club-x'],
      [
        'turno inválido',
        rebote(new BookingValidationError('x')),
        () => form(),
        'error=unavailable',
      ],
      [
        'fuera de fecha',
        rebote(new BookingDateOutOfRangeError('past_date')),
        () => form(),
        'error=date_out_of_range',
      ],
      ['cancha apagada', rebote(new CourtOfflineError(COURT)), () => form(), 'error=unavailable'],
      ['baneado', rebote(new PlayerBannedError('p1', 't1')), () => form(), 'error=banned'],
      [
        'demasiadas señas',
        rebote(new TooManyActiveHoldsError('p1', 't1', 3)),
        () => form(),
        'error=too_many_holds',
      ],
      ['turno tomado', rebote(new SlotTakenError()), () => form(), `${BASE}&pay=transfer`],
      ['reserva creada', () => {}, () => form(), '/reserva/b1/exito'],
    ]

    it.each(cases)('%s', async (_name, arrange, build, contains) => {
      arrange()
      const out = await redirected(createBookingAndCheckout(build()))
      expect(out.type).toBe('replace')
      expect(out.url).toContain(contains)
      // Y ninguno se escapó al historial.
      for (const call of redirect.mock.calls) expect(call[1]).toBe('replace')
    })

    it('la seña (initPoint) también reemplaza', async () => {
      tenantRow.current = tenant({ requires_deposit: true, deposit_percentage: 30 })
      createOnlineBooking.mockResolvedValue({ id: 'b2', status: 'pending_payment' })
      expect(await redirected(createBookingAndCheckout(form()))).toEqual({
        type: 'replace',
        url: 'https://mp.test/pagar',
      })
    })

    it('una reserva pendiente sin MercadoPago conectado va a /pendiente (replace)', async () => {
      tenantRow.current = {
        ...tenant({ requires_deposit: true, deposit_percentage: 30 }),
        mpAccessToken: null,
      }
      createOnlineBooking.mockResolvedValue({ id: 'b3', status: 'pending_payment' })
      expect(await redirected(createBookingAndCheckout(form()))).toEqual({
        type: 'replace',
        url: '/reserva/b3/pendiente',
      })
    })
  })
})
