import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildOwnerIntentCookie,
  OWNER_INTENT_COOKIE_TTL_MS,
  verifyOwnerIntentCookie,
} from '@/shared/security/owner-intent-cookie'
import { buildGoogleTermsCookie } from '@/shared/security/google-terms-cookie'

const NOW = 1_750_000_000_000

beforeEach(() => {
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
})

describe('owner-intent-cookie', () => {
  it('una cookie recién firmada verifica', () => {
    expect(verifyOwnerIntentCookie(buildOwnerIntentCookie(NOW), NOW + 1000)).toBe(true)
  })

  it('vencida (now >= exp) no verifica', () => {
    const cookie = buildOwnerIntentCookie(NOW)
    expect(verifyOwnerIntentCookie(cookie, NOW + OWNER_INTENT_COOKIE_TTL_MS - 1)).toBe(true)
    expect(verifyOwnerIntentCookie(cookie, NOW + OWNER_INTENT_COOKIE_TTL_MS)).toBe(false)
  })

  it('firma alterada o payload alterado no verifican', () => {
    const cookie = buildOwnerIntentCookie(NOW)
    const dot = cookie.indexOf('.')
    const sig = cookie.slice(dot + 1)
    const badSig = `${cookie.slice(0, dot + 1)}${sig.split('').reverse().join('')}`
    const payload = cookie.slice(0, dot)
    const flipped = `${payload.slice(0, -1)}${payload.at(-1) === 'A' ? 'B' : 'A'}${cookie.slice(dot)}`
    expect(verifyOwnerIntentCookie(badSig, NOW + 1)).toBe(false)
    expect(verifyOwnerIntentCookie(flipped, NOW + 1)).toBe(false)
  })

  it('ausente o con formato basura no verifica', () => {
    for (const v of [undefined, null, '', 'nodot', '.', '.abc', 'abc.']) {
      expect(verifyOwnerIntentCookie(v, NOW)).toBe(false)
    }
  })

  it('firmada con otro secreto no verifica (anti-forja)', () => {
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'attacker-secret-also-16-chars-xx')
    const forged = buildOwnerIntentCookie(NOW)
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
    expect(verifyOwnerIntentCookie(forged, NOW + 1)).toBe(false)
  })

  it('separación de dominio: la cookie de términos no sirve como intención owner', () => {
    expect(verifyOwnerIntentCookie(buildGoogleTermsCookie('v1', NOW), NOW + 1)).toBe(false)
  })

  it('lanza si falta el secreto al firmar', () => {
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', undefined)
    expect(() => buildOwnerIntentCookie(NOW)).toThrow(/IMPERSONATION_COOKIE_SECRET/)
  })
})
