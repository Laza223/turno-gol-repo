import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildGoogleTermsCookie,
  GOOGLE_TERMS_COOKIE_TTL_MS,
  verifyGoogleTermsCookie,
} from '@/shared/security/google-terms-cookie'

// Mismo patrón que impersonation-cookie.test.ts — mismo mecanismo HMAC, con
// namespace propio (revisión adversarial 2026-08-14: reemplaza el query param
// `agreed` sin firma que viajaba en el redirectTo de Google OAuth).

const NOW = 1_750_000_000_000

beforeEach(() => {
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
})

describe('buildGoogleTermsCookie / verifyGoogleTermsCookie', () => {
  it('roundtrip: una cookie recién firmada verifica y trae termsVersion', () => {
    const cookie = buildGoogleTermsCookie('v3', NOW)
    expect(verifyGoogleTermsCookie(cookie, NOW + 1000)).toEqual({ termsVersion: 'v3' })
  })

  it('rechaza una cookie expirada (now >= exp)', () => {
    const cookie = buildGoogleTermsCookie('v1', NOW)
    expect(verifyGoogleTermsCookie(cookie, NOW + GOOGLE_TERMS_COOKIE_TTL_MS)).toBeNull()
    expect(verifyGoogleTermsCookie(cookie, NOW + GOOGLE_TERMS_COOKIE_TTL_MS + 1)).toBeNull()
  })

  it('rechaza firma alterada', () => {
    const cookie = buildGoogleTermsCookie('v1', NOW)
    const dot = cookie.indexOf('.')
    const tampered = `${cookie.slice(0, dot + 1)}${cookie
      .slice(dot + 1)
      .split('')
      .reverse()
      .join('')}`
    expect(verifyGoogleTermsCookie(tampered, NOW + 1000)).toBeNull()
  })

  it('rechaza payload alterado (firma ya no coincide) — no se puede forzar termsVersion', () => {
    const cookie = buildGoogleTermsCookie('v1', NOW)
    const dot = cookie.indexOf('.')
    const payload = cookie.slice(0, dot)
    const flipped = `${payload.slice(0, -1)}${payload.at(-1) === 'A' ? 'B' : 'A'}`
    const tampered = `${flipped}${cookie.slice(dot)}`
    expect(verifyGoogleTermsCookie(tampered, NOW + 1000)).toBeNull()
  })

  it('rechaza formatos basura / ausente', () => {
    expect(verifyGoogleTermsCookie(undefined, NOW)).toBeNull()
    expect(verifyGoogleTermsCookie(null, NOW)).toBeNull()
    expect(verifyGoogleTermsCookie('', NOW)).toBeNull()
    expect(verifyGoogleTermsCookie('nodot', NOW)).toBeNull()
    expect(verifyGoogleTermsCookie('.', NOW)).toBeNull()
    expect(verifyGoogleTermsCookie('.abc', NOW)).toBeNull()
  })

  it('una cookie firmada con OTRO secreto no verifica (anti-forja, el ataque original)', () => {
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'attacker-secret-also-16-chars-xx')
    const forged = buildGoogleTermsCookie('v1', NOW)
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
    expect(verifyGoogleTermsCookie(forged, NOW + 1000)).toBeNull()
  })

  it('lanza si falta el secreto', () => {
    vi.stubEnv('IMPERSONATION_COOKIE_SECRET', undefined)
    expect(() => buildGoogleTermsCookie('v1', NOW)).toThrow(/IMPERSONATION_COOKIE_SECRET/)
  })

  it('domain separation: una cookie de impersonación NO verifica como cookie de términos', async () => {
    const { buildImpersonationCookie } = await import('@/shared/security/impersonation-cookie')
    const impersonationCookie = buildImpersonationCookie(
      { tenantId: '11111111-1111-4111-8111-111111111111', systemAdminId: '2' },
      NOW,
    )
    expect(verifyGoogleTermsCookie(impersonationCookie, NOW + 1000)).toBeNull()
  })
})
