import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkBookingIntent,
  signCookieBookingIntent,
  signEmailBookingIntent,
  verifyCookieBookingIntent,
  verifyEmailBookingIntent,
  type BookingIntentFields,
} from '@/shared/security/booking-intent'

// El vínculo que deja confirmar la reserva sola al volver del ingreso. Lo que protege: que un
// enlace de otra persona, de otro turno, vencido o alterado NUNCA confirme nada.

const SECRET = 'test-secret-at-least-16-chars-long'
const NOW = 1_800_000_000_000
const MIN = 60_000

const FIELDS: BookingIntentFields = {
  slug: 'club-x',
  court: '2f6c0f6e-1a3b-4c5d-8e9f-0a1b2c3d4e5f',
  date: '2099-01-02',
  time: '21:00',
  dur: 60,
  pay: 'cash',
}
const EMAIL = 'tomas@example.com'

beforeEach(() => {
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', SECRET)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

/** Parte el token en payload y firma, y vuelve a armarlo con lo que se cambie. */
function tamper(token: string, change: (payload: Record<string, unknown>) => void): string {
  const [payload, sig] = token.split('.')
  const body = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))
  change(body)
  return `${Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')}.${sig}`
}

describe('vínculo por email', () => {
  it('firma y verifica con el mismo email', () => {
    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW)).toEqual({ ok: true })
  })

  it('el email no viaja: ni en claro, ni en el payload', () => {
    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    const payload = Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8')
    expect(token).not.toContain('tomas')
    expect(payload).not.toContain('tomas')
    expect(payload).not.toContain('@')
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(
      ['court', 'date', 'dur', 'exp', 'pay', 'slug', 'time'].sort(),
    )
  })

  it('mayúsculas y espacios en el email son el mismo email', () => {
    const token = signEmailBookingIntent(FIELDS, '  Tomas@Example.COM ', NOW)
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW)).toEqual({ ok: true })
    const lower = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    expect(verifyEmailBookingIntent(lower, ' TOMAS@example.com', FIELDS, NOW)).toEqual({ ok: true })
  })

  it('otro email no verifica: es el caso de quien abre el mail de otro', () => {
    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    expect(verifyEmailBookingIntent(token, 'otra@example.com', FIELDS, NOW)).toEqual({
      ok: false,
      reason: 'email_mismatch',
    })
  })

  it.each([null, undefined, ''])('una sesión sin email (%j) no verifica', (email) => {
    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    expect(verifyEmailBookingIntent(token, email, FIELDS, NOW)).toMatchObject({ ok: false })
  })

  it('vive 60 minutos: a los 59 verifica, al cumplirse el plazo no', () => {
    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW + 59 * MIN).ok).toBe(true)
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW + 60 * MIN)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('no vence antes que el enlace del mail: dura lo mismo que otp_expiry de Supabase', () => {
    // La promesa "entrás y la reserva queda confirmada" no puede caducar antes que el enlace que la
    // trae: si el enlace todavía entra, el vínculo tiene que seguir valiendo.
    const config = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8')
    const otpExpirySeconds = Number(/^otp_expiry\s*=\s*(\d+)/m.exec(config)?.[1])
    expect(otpExpirySeconds).toBeGreaterThan(0)

    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    const lastSecond = NOW + otpExpirySeconds * 1000 - 1000
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, lastSecond).ok).toBe(true)
    expect(
      verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW + otpExpirySeconds * 1000),
    ).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('un payload alterado con la firma original no verifica', () => {
    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    const swapped = tamper(token, (p) => {
      p.time = '22:00'
    })
    expect(verifyEmailBookingIntent(swapped, EMAIL, { ...FIELDS, time: '22:00' }, NOW).ok).toBe(
      false,
    )
    // Alargar la vida del enlace tampoco funciona.
    const longer = tamper(token, (p) => {
      p.exp = NOW + 24 * 60 * MIN
    })
    expect(verifyEmailBookingIntent(longer, EMAIL, FIELDS, NOW + 61 * MIN).ok).toBe(false)
  })

  it('una firma alterada no verifica', () => {
    const [payload, sig] = signEmailBookingIntent(FIELDS, EMAIL, NOW).split('.')
    const flipped = `${sig!.startsWith('A') ? 'B' : 'A'}${sig!.slice(1)}`
    expect(verifyEmailBookingIntent(`${payload}.${flipped}`, EMAIL, FIELDS, NOW).ok).toBe(false)
  })

  it('con otro secreto no verifica', () => {
    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'otro-secreto-de-mas-de-16-chars')
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW).ok).toBe(false)
  })

  it('un payload bien firmado pero mal formado es inválido', () => {
    const body = Buffer.from(JSON.stringify({ ...FIELDS, exp: 'nunca' }), 'utf8').toString(
      'base64url',
    )
    const sig = createHmac('sha256', SECRET)
      .update(`booking-intent-v1:email:${body}:${EMAIL}`)
      .digest('base64url')
    expect(verifyEmailBookingIntent(`${body}.${sig}`, EMAIL, FIELDS, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it.each([
    ['vacío', ''],
    ['sin punto', 'abc'],
    ['punto al principio', '.abc'],
    ['basura', 'no-es.un-token'],
    ['payload no JSON', `${Buffer.from('hola').toString('base64url')}.firma`],
  ])('un token %s es inválido y no lanza', (_name, token) => {
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it.each([null, undefined])('sin token (%j) es inválido y no lanza', (token) => {
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW).ok).toBe(false)
  })
})

describe('qué se compara contra lo que se va a reservar', () => {
  const token = () => signEmailBookingIntent(FIELDS, EMAIL, NOW)
  const verifyWith = (over: Partial<BookingIntentFields>) =>
    verifyEmailBookingIntent(token(), EMAIL, { ...FIELDS, ...over }, NOW)

  it.each<[string, Partial<BookingIntentFields>]>([
    ['el complejo', { slug: 'otro-club' }],
    ['la cancha', { court: '00000000-0000-4000-8000-000000000001' }],
    ['el día', { date: '2099-01-03' }],
    ['la hora', { time: '20:00' }],
    ['la duración', { dur: 120 }],
    ['cómo paga', { pay: 'transfer' }],
    ['cómo paga (ahora sin método)', { pay: null }],
  ])('si cambia %s, los campos no coinciden', (_name, over) => {
    expect(verifyWith(over)).toEqual({ ok: false, reason: 'fields_mismatch' })
  })

  it('sin método de pago en el vínculo, tampoco hay que traer uno', () => {
    const sinPay = signEmailBookingIntent({ ...FIELDS, pay: null }, EMAIL, NOW)
    expect(verifyEmailBookingIntent(sinPay, EMAIL, { ...FIELDS, pay: null }, NOW).ok).toBe(true)
    expect(verifyEmailBookingIntent(sinPay, EMAIL, FIELDS, NOW)).toEqual({
      ok: false,
      reason: 'fields_mismatch',
    })
  })
})

describe('vínculo por cookie (Google, mismo navegador)', () => {
  it('firma y verifica sin email', () => {
    const token = signCookieBookingIntent(FIELDS, NOW)
    expect(verifyCookieBookingIntent(token, FIELDS, NOW)).toEqual({ ok: true })
  })

  it('vive 10 minutos', () => {
    const token = signCookieBookingIntent(FIELDS, NOW)
    expect(verifyCookieBookingIntent(token, FIELDS, NOW + 9 * MIN).ok).toBe(true)
    expect(verifyCookieBookingIntent(token, FIELDS, NOW + 10 * MIN)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('con campos distintos no verifica', () => {
    const token = signCookieBookingIntent(FIELDS, NOW)
    expect(verifyCookieBookingIntent(token, { ...FIELDS, time: '22:00' }, NOW)).toEqual({
      ok: false,
      reason: 'fields_mismatch',
    })
  })

  it('un payload alterado no verifica', () => {
    const swapped = tamper(signCookieBookingIntent(FIELDS, NOW), (p) => {
      p.court = '00000000-0000-4000-8000-000000000001'
    })
    expect(
      verifyCookieBookingIntent(
        swapped,
        { ...FIELDS, court: '00000000-0000-4000-8000-000000000001' },
        NOW,
      ).ok,
    ).toBe(false)
  })
})

describe('un canal no sirve por el otro', () => {
  it('el token del mail no sirve como cookie', () => {
    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    expect(verifyCookieBookingIntent(token, FIELDS, NOW).ok).toBe(false)
  })

  it('el token de la cookie no sirve como enlace del mail, con ningún email', () => {
    const token = signCookieBookingIntent(FIELDS, NOW)
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW).ok).toBe(false)
    expect(verifyEmailBookingIntent(token, '', FIELDS, NOW).ok).toBe(false)
  })
})

describe('sin secreto', () => {
  it.each([undefined, '', 'corto'])('(%j) verificar devuelve inválido y no lanza', (secret) => {
    const token = signEmailBookingIntent(FIELDS, EMAIL, NOW)
    const cookie = signCookieBookingIntent(FIELDS, NOW)
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', secret as string)
    if (secret === undefined) delete process.env.IMPERSONATION_COOKIE_SECRET

    const invalid = { ok: false, reason: 'invalid' }
    expect(verifyEmailBookingIntent(token, EMAIL, FIELDS, NOW)).toEqual(invalid)
    expect(verifyCookieBookingIntent(cookie, FIELDS, NOW)).toEqual(invalid)
    expect(() => signEmailBookingIntent(FIELDS, EMAIL, NOW)).toThrow(/IMPERSONATION_COOKIE_SECRET/)
    expect(() => signCookieBookingIntent(FIELDS, NOW)).toThrow(/IMPERSONATION_COOKIE_SECRET/)
  })
})

describe('checkBookingIntent — qué token vino y cuál manda', () => {
  const email = () => signEmailBookingIntent(FIELDS, EMAIL, NOW)
  const cookie = () => signCookieBookingIntent(FIELDS, NOW)
  const run = (input: Parameters<typeof checkBookingIntent>[0], at = NOW) =>
    checkBookingIntent(input, FIELDS, at)

  it('sin ningún token: null (una visita normal no es un intento)', () => {
    expect(run({ email: EMAIL })).toBeNull()
    expect(run({ linkToken: '', cookieToken: null, email: EMAIL })).toBeNull()
  })

  it('el token del enlace verifica con el email de la sesión', () => {
    expect(run({ linkToken: email(), email: EMAIL })).toEqual({ ok: true })
  })

  it('la cookie verifica sola, y también si el mismo token viaja en el form', () => {
    expect(run({ cookieToken: cookie(), email: EMAIL })).toEqual({ ok: true })
    expect(run({ linkToken: cookie(), cookieToken: cookie(), email: EMAIL })).toEqual({ ok: true })
  })

  it('un token de Google NO sirve si falta la cookie (otro navegador): solo viaja en el form', () => {
    expect(run({ linkToken: cookie(), email: EMAIL })).toMatchObject({ ok: false })
  })

  it('de dos fallas informa la que llegó más lejos: vencido, no "otro email"', () => {
    const vencida = cookie()
    expect(run({ linkToken: vencida, cookieToken: vencida, email: EMAIL }, NOW + 11 * MIN)).toEqual(
      { ok: false, reason: 'expired' },
    )
  })

  it('un enlace de otro email falla como email_mismatch', () => {
    expect(run({ linkToken: email(), email: 'otra@example.com' })).toEqual({
      ok: false,
      reason: 'email_mismatch',
    })
  })
})
