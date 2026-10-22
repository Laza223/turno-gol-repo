import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signCookieBookingIntent, signEmailBookingIntent } from '@/shared/security/booking-intent'
import {
  RIVAL_INTENT_COOKIE_NAME,
  checkRivalIntent,
  signCookieRivalIntent,
  signEmailRivalIntent,
} from '@/shared/security/rival-intent'

// El vínculo que prueba que el jugador tocó "Voy" para ESTE partido. Lo que protege: que un enlace
// de otra persona, de otro partido, vencido, alterado o de la reserva NUNCA sume a nadie.

const SECRET = 'test-secret-at-least-16-chars-long'
const NOW = 1_800_000_000_000
const MIN = 60_000
const FIELDS = { code: 'ABCDEFGH23' }
const OTHER = { code: 'KMNPQRST45' }
const EMAIL = 'tomas@example.com'

beforeEach(() => {
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', SECRET)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

function tamper(token: string, change: (payload: Record<string, unknown>) => void): string {
  const [payload, sig] = token.split('.')
  const body = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))
  change(body)
  return `${Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')}.${sig}`
}

describe('canal email', () => {
  it('firma y verifica con el mismo email (sin importar mayúsculas ni espacios)', () => {
    const token = signEmailRivalIntent(FIELDS, EMAIL, NOW)
    expect(checkRivalIntent({ linkToken: token, email: EMAIL }, FIELDS, NOW)).toEqual({ ok: true })
    expect(
      checkRivalIntent({ linkToken: token, email: '  Tomas@Example.COM ' }, FIELDS, NOW),
    ).toEqual({ ok: true })
  })

  it('el email no viaja en el token', () => {
    const token = signEmailRivalIntent(FIELDS, EMAIL, NOW)
    const payload = Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8')
    expect(token).not.toContain('tomas')
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(['code', 'exp'])
  })

  it('otro email: email_mismatch', () => {
    const token = signEmailRivalIntent(FIELDS, EMAIL, NOW)
    expect(checkRivalIntent({ linkToken: token, email: 'otro@example.com' }, FIELDS, NOW)).toEqual({
      ok: false,
      reason: 'email_mismatch',
    })
  })

  it('sin email de sesión: invalid', () => {
    const token = signEmailRivalIntent(FIELDS, EMAIL, NOW)
    expect(checkRivalIntent({ linkToken: token, email: null }, FIELDS, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(checkRivalIntent({ linkToken: token, email: '  ' }, FIELDS, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('otro partido: fields_mismatch', () => {
    const token = signEmailRivalIntent(FIELDS, EMAIL, NOW)
    expect(checkRivalIntent({ linkToken: token, email: EMAIL }, OTHER, NOW)).toEqual({
      ok: false,
      reason: 'fields_mismatch',
    })
  })

  it('vence a la hora, no antes', () => {
    const token = signEmailRivalIntent(FIELDS, EMAIL, NOW)
    expect(checkRivalIntent({ linkToken: token, email: EMAIL }, FIELDS, NOW + 59 * MIN)).toEqual({
      ok: true,
    })
    expect(checkRivalIntent({ linkToken: token, email: EMAIL }, FIELDS, NOW + 60 * MIN)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('alterar el código del token no pasa (la firma no cierra)', () => {
    const forged = tamper(signEmailRivalIntent(FIELDS, EMAIL, NOW), (p) => (p.code = OTHER.code))
    expect(checkRivalIntent({ linkToken: forged, email: EMAIL }, OTHER, NOW)).toMatchObject({
      ok: false,
    })
  })

  it('basura: nunca lanza', () => {
    for (const linkToken of ['x', '.', 'a.b', '....', `${'A'.repeat(20)}.${'B'.repeat(43)}`]) {
      expect(checkRivalIntent({ linkToken, email: EMAIL }, FIELDS, NOW)).toEqual({
        ok: false,
        reason: 'invalid',
      })
    }
  })
})

describe('canal cookie', () => {
  it('firma y verifica sin email', () => {
    const token = signCookieRivalIntent(FIELDS, NOW)
    expect(checkRivalIntent({ cookieToken: token }, FIELDS, NOW)).toEqual({ ok: true })
    expect(RIVAL_INTENT_COOKIE_NAME).toBe('tg_rival_intent')
  })

  it('vence a los 10 minutos', () => {
    const token = signCookieRivalIntent(FIELDS, NOW)
    expect(checkRivalIntent({ cookieToken: token }, FIELDS, NOW + 9 * MIN)).toEqual({ ok: true })
    expect(checkRivalIntent({ cookieToken: token }, FIELDS, NOW + 10 * MIN)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('otro partido: fields_mismatch; alterado: invalid', () => {
    const token = signCookieRivalIntent(FIELDS, NOW)
    expect(checkRivalIntent({ cookieToken: token }, OTHER, NOW)).toEqual({
      ok: false,
      reason: 'fields_mismatch',
    })
    const forged = tamper(token, (p) => (p.exp = NOW + 999 * MIN))
    expect(checkRivalIntent({ cookieToken: forged }, FIELDS, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})

describe('canales y dominios separados', () => {
  it('un token de email no sirve por la cookie, ni al revés', () => {
    const email = signEmailRivalIntent(FIELDS, EMAIL, NOW)
    const cookie = signCookieRivalIntent(FIELDS, NOW)
    expect(checkRivalIntent({ cookieToken: email }, FIELDS, NOW)).toMatchObject({ ok: false })
    expect(checkRivalIntent({ linkToken: cookie, email: EMAIL }, FIELDS, NOW)).toMatchObject({
      ok: false,
    })
  })

  it('un token de la reserva no sirve como de RIVAL (dominio distinto)', () => {
    const booking = {
      slug: 'club-x',
      court: '2f6c0f6e-1a3b-4c5d-8e9f-0a1b2c3d4e5f',
      date: '2099-01-02',
      time: '21:00',
      dur: 60,
      pay: null,
    }
    expect(
      checkRivalIntent(
        { linkToken: signEmailBookingIntent(booking, EMAIL, NOW), email: EMAIL },
        FIELDS,
        NOW,
      ),
    ).toMatchObject({ ok: false })
    expect(
      checkRivalIntent({ cookieToken: signCookieBookingIntent(booking, NOW) }, FIELDS, NOW),
    ).toMatchObject({ ok: false })
    // Aunque el payload tuviera la forma de RIVAL, la firma es de otro dominio.
    const payload = Buffer.from(
      JSON.stringify({ code: FIELDS.code, exp: NOW + MIN }),
      'utf8',
    ).toString('base64url')
    const bookingSig = signCookieBookingIntent(booking, NOW).split('.')[1]
    expect(
      checkRivalIntent({ cookieToken: `${payload}.${bookingSig}` }, FIELDS, NOW),
    ).toMatchObject({ ok: false })
  })

  it('sin secreto, firmar lanza y verificar no', () => {
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', '')
    expect(() => signCookieRivalIntent(FIELDS, NOW)).toThrow()
    expect(checkRivalIntent({ cookieToken: 'a.b' }, FIELDS, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})

describe('checkRivalIntent', () => {
  it('null si no vino ningún token (visita normal)', () => {
    expect(checkRivalIntent({}, FIELDS, NOW)).toBeNull()
    expect(
      checkRivalIntent({ linkToken: '', cookieToken: null, email: EMAIL }, FIELDS, NOW),
    ).toBeNull()
  })

  it('si uno vale, vale (aunque el otro falle)', () => {
    const good = signCookieRivalIntent(FIELDS, NOW)
    expect(
      checkRivalIntent({ linkToken: 'basura', cookieToken: good, email: EMAIL }, FIELDS, NOW),
    ).toEqual({ ok: true })
  })

  it('si fallan los dos, informa el que llegó más lejos', () => {
    const expired = signCookieRivalIntent(FIELDS, NOW - 20 * MIN)
    expect(
      checkRivalIntent({ linkToken: 'basura', cookieToken: expired, email: EMAIL }, FIELDS, NOW),
    ).toEqual({ ok: false, reason: 'expired' })
  })
})
