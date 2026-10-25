import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signAlertUnsubToken, verifyAlertUnsubToken } from '@/shared/security/rival-alert-token'
import { signCookieRivalIntent } from '@/shared/security/rival-intent'

// El link de baja del mail de alertas: sin login y sin vencimiento. Lo que protege: que un token
// alterado, ajeno o de otro dominio (el vínculo de "Voy") nunca borre la suscripción de alguien.

const SECRET = 'test-secret-at-least-16-chars-long'
const FIELDS = {
  playerId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
}

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

describe('token de baja de alertas', () => {
  it('ida y vuelta: devuelve jugador y complejo', () => {
    expect(verifyAlertUnsubToken(signAlertUnsubToken(FIELDS))).toEqual(FIELDS)
  })

  it('no vence: sigue valiendo años después', () => {
    const token = signAlertUnsubToken(FIELDS)
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 5 * 365 * 24 * 3600_000)
    try {
      expect(verifyAlertUnsubToken(token)).toEqual(FIELDS)
    } finally {
      vi.useRealTimers()
    }
  })

  it('un payload alterado (otro jugador o otro complejo) no verifica', () => {
    const token = signAlertUnsubToken(FIELDS)
    const otherPlayer = tamper(token, (b) => {
      b.p = '33333333-3333-4333-8333-333333333333'
    })
    const otherTenant = tamper(token, (b) => {
      b.t = '44444444-4444-4444-8444-444444444444'
    })
    expect(verifyAlertUnsubToken(otherPlayer)).toBeNull()
    expect(verifyAlertUnsubToken(otherTenant)).toBeNull()
  })

  it('una firma alterada no verifica', () => {
    const token = signAlertUnsubToken(FIELDS)
    const [payload, sig] = token.split('.')
    const flipped = `${payload}.${sig!.slice(0, -2)}${sig!.endsWith('A') ? 'BB' : 'AA'}`
    expect(verifyAlertUnsubToken(flipped)).toBeNull()
  })

  it('un token firmado con otro secreto no verifica', () => {
    const token = signAlertUnsubToken(FIELDS)
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'otro-secreto-distinto-de-16-chars')
    expect(verifyAlertUnsubToken(token)).toBeNull()
  })

  it('dominio cruzado: un token de rival-intent no sirve acá', () => {
    expect(verifyAlertUnsubToken(signCookieRivalIntent({ code: 'ABCDEFGH23' }))).toBeNull()
  })

  it('dominio cruzado: un token de baja no sirve como vínculo de rival-intent', async () => {
    const { checkRivalIntent } = await import('@/shared/security/rival-intent')
    const token = signAlertUnsubToken(FIELDS)
    const r = checkRivalIntent({ cookieToken: token }, { code: 'ABCDEFGH23' })
    expect(r).toMatchObject({ ok: false })
  })

  it.each([null, undefined, '', '.', 'abc', 'a.b', 'a.b.c', '%%%.%%%', '{}.{}'])(
    'input basura (%s) devuelve null y no lanza',
    (junk) => {
      expect(verifyAlertUnsubToken(junk)).toBeNull()
    },
  )

  it('sin secreto configurado devuelve null y no lanza al verificar', () => {
    const token = signAlertUnsubToken(FIELDS)
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', '')
    expect(verifyAlertUnsubToken(token)).toBeNull()
  })
})
