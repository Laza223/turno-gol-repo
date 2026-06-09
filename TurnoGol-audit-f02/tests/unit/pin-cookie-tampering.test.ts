import { beforeEach, describe, expect, it } from 'vitest'
import { buildPinCookie, verifyPinCookie, COOKIE_TTL_MS } from '@/modules/auth/pin'

beforeEach(() => {
  process.env.PIN_COOKIE_SECRET = 'test-pin-secret-1234567890ABCDEF'
})

describe('PIN cookie HMAC + TTL (B6.3 + B6.4)', () => {
  it('valid cookie passes verify', () => {
    const cookie = buildPinCookie()
    expect(verifyPinCookie(cookie)).toBe(true)
  })

  it('tampered payload (timestamp) fails verify', () => {
    const cookie = buildPinCookie()
    const [, sig] = cookie.split('.')
    const fakePayload = Buffer.from(String(Date.now() + 10_000_000), 'utf8').toString('base64url')
    const tampered = `${fakePayload}.${sig}`
    expect(verifyPinCookie(tampered)).toBe(false)
  })

  it('tampered signature fails verify', () => {
    const cookie = buildPinCookie()
    const [payload] = cookie.split('.')
    const fakeSig = Buffer.from('attacker-forged-signature').toString('base64url')
    const tampered = `${payload}.${fakeSig}`
    expect(verifyPinCookie(tampered)).toBe(false)
  })

  it('empty / malformed cookie fails verify', () => {
    expect(verifyPinCookie('')).toBe(false)
    expect(verifyPinCookie('nodot')).toBe(false)
    expect(verifyPinCookie('.')).toBe(false)
    // Two dots split: indexOf('.') = 1, payload='a', sig='b.c'. sig won't match.
    expect(verifyPinCookie('a.b.c')).toBe(false)
  })

  it('expired cookie (timestamp > 30min ago) fails verify', () => {
    // Build cookie with a stale timestamp using the same private flow:
    // recreate the HMAC computation manually with the same secret.
    const oldTs = Date.now() - COOKIE_TTL_MS - 1_000
    const payload = Buffer.from(String(oldTs), 'utf8').toString('base64url')
    // We need to sign the payload with the secret — use a helper round trip.
    // buildPinCookie() always uses Date.now(); craft the signature by reusing
    // verifyPinCookie's tolerance: replace payload while keeping the same
    // signature would fail. To get a properly signed stale cookie, we re-
    // implement the signing inline (same algorithm as src/modules/auth/pin.ts).
    const { createHmac } = require('node:crypto') as typeof import('node:crypto')
    const sig = createHmac('sha256', process.env.PIN_COOKIE_SECRET!)
      .update(payload)
      .digest('base64url')
    const stale = `${payload}.${sig}`

    expect(verifyPinCookie(stale)).toBe(false)
  })

  it('cookie signed with wrong secret fails verify', () => {
    const { createHmac } = require('node:crypto') as typeof import('node:crypto')
    const payload = Buffer.from(String(Date.now()), 'utf8').toString('base64url')
    const sig = createHmac('sha256', 'wrong-secret-key').update(payload).digest('base64url')
    const forged = `${payload}.${sig}`

    expect(verifyPinCookie(forged)).toBe(false)
  })
})
