import { beforeEach, describe, expect, it, vi } from 'vitest'

// El ingreso de /reservar en el servidor: la casilla del +18 se exige acá (el botón ya no se
// deshabilita), el error dice de qué campo es, el `formato` y el `pay` sobreviven a los rebotes,
// el `next` no saca al jugador del sitio, y con seña el cliente no elige cómo se paga.

const {
  signInWithGooglePlayer,
  signInWithPlayerMagicLink,
  redirect,
  cookieSet,
  cookieDelete,
  user,
  tenantRow,
  createOnlineBooking,
  createDepositPayment,
} = vi.hoisted(() => ({
  signInWithGooglePlayer: vi.fn(),
  signInWithPlayerMagicLink: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  user: vi.fn(),
  // El tenant que devuelve la lectura de `createBookingAndCheckout` (cada caso lo arma).
  tenantRow: { current: null as unknown },
  createOnlineBooking: vi.fn(),
  createDepositPayment: vi.fn(),
}))

vi.mock('@/modules/auth/auth.service', () => ({
  signInWithGooglePlayer,
  signInWithPlayerMagicLink,
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: user }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ origin: 'http://localhost:3000' }),
  cookies: async () => ({ set: cookieSet, delete: cookieDelete }),
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/shared/rate-limit', () => ({
  enforce: vi.fn(async () => ({ ok: true })),
  parseClientIp: () => '1.1.1.1',
}))
vi.mock('@/shared/db/client', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [tenantRow.current] }) }) }),
  }),
  withPlayerContext: async (_playerId: string, run: (tx: unknown) => unknown) =>
    run({ execute: vi.fn() }),
  withTenantContext: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.service', () => ({ createOnlineBooking }))
vi.mock('@/modules/payments/payment.service', () => ({ createDepositPayment }))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: () => ({}) }))

import {
  createBookingAndCheckout,
  sendPlayerMagicLink,
  startGoogleLoginFromReservar,
} from '@/app/(public)/[slug]/reservar/actions'
import { GOOGLE_TERMS_COOKIE_NAME } from '@/shared/security/google-terms-cookie'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const NEXT = '/club-x/reservar?court=c1&date=2099-01-02&time=21:00&dur=60&formato=5&pay=transfer'
const idle = { status: 'idle' } as const

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
  signInWithGooglePlayer.mockResolvedValue({ url: 'https://accounts.google.com/o' })
  signInWithPlayerMagicLink.mockResolvedValue({ ok: true })
})

describe('startGoogleLoginFromReservar — la casilla se exige en el servidor', () => {
  it('sin la casilla: error EN la casilla, no redirige ni setea la cookie, y borra una vieja', async () => {
    const result = await startGoogleLoginFromReservar(
      idle,
      fd({ next: NEXT, firstName: 'Tomás', email: 'tomas@example.com' }),
    )

    expect(result).toMatchObject({
      status: 'error',
      field: 'terms',
      message: 'Tenés que aceptar los términos.',
      // Lo tipeado vuelve: el form se resetea al terminar la action.
      values: { firstName: 'Tomás', email: 'tomas@example.com' },
    })
    expect(signInWithGooglePlayer).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
    expect(cookieSet).not.toHaveBeenCalled()
    expect(cookieDelete).toHaveBeenCalledWith(GOOGLE_TERMS_COOKIE_NAME)
  })

  it.each(['', 'off', 'true', '1'])('un terms que no es "on" (%j) tampoco pasa', async (terms) => {
    const result = await startGoogleLoginFromReservar(idle, fd({ next: NEXT, terms }))
    expect(result).toMatchObject({ status: 'error', field: 'terms' })
    expect(signInWithGooglePlayer).not.toHaveBeenCalled()
  })

  it('con la casilla: cookie de términos y redirect a Google con el mismo next (formato y pay)', async () => {
    await expect(
      startGoogleLoginFromReservar(idle, fd({ next: NEXT, terms: 'on' })),
    ).rejects.toThrow('NEXT_REDIRECT:https://accounts.google.com/o')

    expect(cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: GOOGLE_TERMS_COOKIE_NAME, httpOnly: true }),
    )
    expect(signInWithGooglePlayer).toHaveBeenCalledWith(
      `http://localhost:3000/api/auth/callback?next=${encodeURIComponent(NEXT)}`,
    )
  })
})

describe('startGoogleLoginFromReservar — la firma de antes del deploy', () => {
  // Una pestaña abierta antes del deploy la llama con `[formData]`, sin el estado previo.
  it('con (formData): con la casilla redirige a Google igual que con la firma nueva', async () => {
    await expect(startGoogleLoginFromReservar(fd({ next: NEXT, terms: 'on' }))).rejects.toThrow(
      'NEXT_REDIRECT:https://accounts.google.com/o',
    )

    expect(cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: GOOGLE_TERMS_COOKIE_NAME, httpOnly: true }),
    )
    expect(signInWithGooglePlayer).toHaveBeenCalledWith(
      `http://localhost:3000/api/auth/callback?next=${encodeURIComponent(NEXT)}`,
    )
  })

  it('con (formData): sin la casilla devuelve el error en la casilla, no revienta', async () => {
    const result = await startGoogleLoginFromReservar(
      fd({ next: NEXT, firstName: 'Tomás', email: 'tomas@example.com' }),
    )

    expect(result).toMatchObject({
      status: 'error',
      field: 'terms',
      values: { firstName: 'Tomás', email: 'tomas@example.com' },
    })
    expect(signInWithGooglePlayer).not.toHaveBeenCalled()
    expect(cookieDelete).toHaveBeenCalledWith(GOOGLE_TERMS_COOKIE_NAME)
  })
})

describe('sendPlayerMagicLink — de qué campo es el error', () => {
  const ok = { terms: 'on', firstName: 'Tomás', email: 'tomas@example.com', next: NEXT }

  it('sin la casilla: field "terms"', async () => {
    const { terms: _omit, ...rest } = ok
    expect(await sendPlayerMagicLink(idle, fd(rest))).toMatchObject({
      status: 'error',
      field: 'terms',
      message: 'Tenés que aceptar los términos.',
    })
  })

  it('sin nombre: field "firstName"; con email roto: field "email"', async () => {
    expect(await sendPlayerMagicLink(idle, fd({ ...ok, firstName: '  ' }))).toMatchObject({
      field: 'firstName',
      message: 'Ingresá tu nombre',
      values: { email: 'tomas@example.com' },
    })
    expect(await sendPlayerMagicLink(idle, fd({ ...ok, email: 'tomas@' }))).toMatchObject({
      field: 'email',
      message: 'Ingresá un email válido',
      values: { firstName: 'Tomás' },
    })
  })

  it('con todo mal, el campo que se marca es el primero de la pantalla (casilla, nombre, email)', async () => {
    const empty = fd({ next: NEXT })
    expect(await sendPlayerMagicLink(idle, empty)).toMatchObject({ field: 'terms' })
    expect(await sendPlayerMagicLink(idle, fd({ next: NEXT, terms: 'on' }))).toMatchObject({
      field: 'firstName',
    })
  })

  it('sin apellido (la pantalla ya no lo pide) manda igual, y el next conserva formato y pay', async () => {
    const result = await sendPlayerMagicLink(idle, fd(ok))

    expect(result).toEqual({ status: 'sent', email: 'tomas@example.com', firstName: 'Tomás' })
    expect(signInWithPlayerMagicLink).toHaveBeenCalledWith(
      'tomas@example.com',
      `http://localhost:3000/api/auth/callback?next=${encodeURIComponent(NEXT)}`,
      expect.objectContaining({ firstName: 'Tomás', lastName: '', agreedTerms: true }),
    )
  })

  it('un error del envío no tiene campo', async () => {
    signInWithPlayerMagicLink.mockResolvedValue({ ok: false })
    const result = await sendPlayerMagicLink(idle, fd(ok))
    expect(result).toMatchObject({ status: 'error' })
    expect(result).not.toHaveProperty('field')
  })
})

describe('createBookingAndCheckout — formato y pay sobreviven al rebote', () => {
  const turno = { slug: 'club-x', court: 'c1', time: '21:00', dur: '60' }
  const base = '/club-x/reservar?court=c1&date=2099-01-02&time=21:00&dur=60'

  it('sin sesión vuelve al mismo confirmar, con formato y pay', async () => {
    user.mockResolvedValue(null)
    await expect(
      createBookingAndCheckout(fd({ ...turno, date: '2099-01-02', formato: '5', pay: 'transfer' })),
    ).rejects.toThrow(`NEXT_REDIRECT:${base}&formato=5&pay=transfer`)
  })

  it('una fecha inválida rebota con el error y sin perder lo elegido', async () => {
    await expect(
      createBookingAndCheckout(fd({ ...turno, date: '2099-13-45', formato: '7', pay: 'cash' })),
    ).rejects.toThrow(
      'NEXT_REDIRECT:/club-x/reservar?court=c1&date=2099-13-45&time=21:00&dur=60&formato=7&pay=cash&error=invalid_date',
    )
  })

  it('un formato o un pay inventados no viajan', async () => {
    user.mockResolvedValue(null)
    await expect(
      createBookingAndCheckout(fd({ ...turno, date: '2099-01-02', formato: '99', pay: 'bitcoin' })),
    ).rejects.toThrow(`NEXT_REDIRECT:${base}`)
    expect(redirect).toHaveBeenLastCalledWith(base)
  })
})

describe('sanitizeNext — el next no saca al jugador del sitio', () => {
  const DEFAULT_CALLBACK = `http://localhost:3000/api/auth/callback?next=${encodeURIComponent('/mis-reservas')}`
  const EVIL = ['//evil.com', 'https://evil.com', 'javascript:alert(1)']
  const ok = { terms: 'on', firstName: 'Tomás', email: 'tomas@example.com' }

  it.each(EVIL)('Google: un next %j cae al default', async (next) => {
    await expect(startGoogleLoginFromReservar(idle, fd({ terms: 'on', next }))).rejects.toThrow(
      'NEXT_REDIRECT:https://accounts.google.com/o',
    )
    expect(signInWithGooglePlayer).toHaveBeenCalledWith(DEFAULT_CALLBACK)
  })

  it.each(EVIL)('email: un next %j cae al default', async (next) => {
    await sendPlayerMagicLink(idle, fd({ ...ok, next }))
    expect(signInWithPlayerMagicLink).toHaveBeenCalledWith(
      'tomas@example.com',
      DEFAULT_CALLBACK,
      expect.anything(),
    )
  })

  it('control: un next del mismo sitio se respeta en las dos', async () => {
    await sendPlayerMagicLink(idle, fd({ ...ok, next: NEXT }))
    expect(signInWithPlayerMagicLink).toHaveBeenCalledWith(
      'tomas@example.com',
      `http://localhost:3000/api/auth/callback?next=${encodeURIComponent(NEXT)}`,
      expect.anything(),
    )
  })
})

describe('createBookingAndCheckout — con seña el cliente no elige cómo se paga', () => {
  const turno = { slug: 'club-x', court: 'c1', date: '2099-01-02', time: '21:00', dur: '60' }
  const tenant = (settings: Record<string, unknown>) => ({
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
  /** Lo que `createOnlineBooking` recibió como datos de la reserva. */
  const bookingInput = () => createOnlineBooking.mock.calls[0]![1] as Record<string, unknown>

  beforeEach(() => {
    user.mockResolvedValue({ type: 'player', playerId: 'p1' })
    createDepositPayment.mockResolvedValue({ initPoint: 'https://mp.test/pagar' })
  })

  it('con seña y pay=cash forzado en el form: la reserva nace sin paymentMethod y va a MercadoPago', async () => {
    tenantRow.current = tenant({ requires_deposit: true, deposit_percentage: 30 })
    createOnlineBooking.mockResolvedValue({ id: 'b1', status: 'pending_payment' })

    await expect(createBookingAndCheckout(fd({ ...turno, pay: 'cash' }))).rejects.toThrow(
      'NEXT_REDIRECT:https://mp.test/pagar',
    )

    expect(bookingInput()).not.toHaveProperty('paymentMethod')
    expect(bookingInput()).toMatchObject({ requiresDeposit: true, depositPercentage: 30 })
  })

  it.each(['cash', 'transfer'])(
    'sin seña, pay=%s lo honra cuando el complejo lo acepta y confirma en el momento',
    async (pay) => {
      tenantRow.current = tenant({})
      createOnlineBooking.mockResolvedValue({ id: 'b2', status: 'confirmed' })

      await expect(createBookingAndCheckout(fd({ ...turno, pay }))).rejects.toThrow(
        'NEXT_REDIRECT:/reserva/b2/exito',
      )

      expect(bookingInput()).toMatchObject({ paymentMethod: pay })
    },
  )

  it('sin seña, un método que el complejo NO acepta no viaja aunque el form lo diga', async () => {
    tenantRow.current = tenant({ accepts_transfer: false })
    createOnlineBooking.mockResolvedValue({ id: 'b3', status: 'confirmed' })

    await expect(createBookingAndCheckout(fd({ ...turno, pay: 'transfer' }))).rejects.toThrow(
      'NEXT_REDIRECT:/reserva/b3/exito',
    )

    expect(bookingInput()).not.toHaveProperty('paymentMethod')
  })
})
