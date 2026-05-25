import { describe, expect, it } from 'vitest'
import { scrubObject, scrubQueryString, PII_KEYS } from '@/lib/sentry-pii-scrub'

describe('Sentry PII scrub helpers (B9.4)', () => {
  describe('scrubObject', () => {
    it('redacts top-level PII keys', () => {
      const r = scrubObject({
        email: 'user@example.com',
        phone: '+5491100000000',
        mp_access_token: 'TEST-1234',
        other: 'visible',
      }) as Record<string, unknown>

      expect(r.email).toBe('[REDACTED]')
      expect(r.phone).toBe('[REDACTED]')
      expect(r.mp_access_token).toBe('[REDACTED]')
      expect(r.other).toBe('visible')
    })

    it('redacts nested PII keys', () => {
      const r = scrubObject({
        user: { email: 'a@b.com', name: 'Juan' },
        meta: { mp_refresh_token: 'TG-xyz' },
      }) as Record<string, Record<string, unknown>>

      expect(r.user.email).toBe('[REDACTED]')
      expect(r.user.name).toBe('Juan')
      expect(r.meta.mp_refresh_token).toBe('[REDACTED]')
    })

    it('handles arrays', () => {
      const r = scrubObject([
        { email: 'x@y.com', id: 1 },
        { email: 'a@b.com', id: 2 },
      ]) as Array<Record<string, unknown>>

      expect(r[0].email).toBe('[REDACTED]')
      expect(r[0].id).toBe(1)
      expect(r[1].email).toBe('[REDACTED]')
    })

    it('case-insensitive key match', () => {
      const r = scrubObject({
        Email: 'a@b.com',
        AUTHORIZATION: 'Bearer xxx',
      }) as Record<string, unknown>

      expect(r.Email).toBe('[REDACTED]')
      expect(r.AUTHORIZATION).toBe('[REDACTED]')
    })

    it('depth limit prevents infinite recursion', () => {
      const cyclic: Record<string, unknown> = { email: 'a@b.com' }
      cyclic.self = cyclic
      // Should not throw.
      expect(() => scrubObject(cyclic)).not.toThrow()
    })

    it('returns primitives unchanged', () => {
      expect(scrubObject('x')).toBe('x')
      expect(scrubObject(1)).toBe(1)
      expect(scrubObject(null)).toBe(null)
      expect(scrubObject(undefined)).toBe(undefined)
    })

    it('PII_KEYS includes common identifiers', () => {
      expect(PII_KEYS.has('email')).toBe(true)
      expect(PII_KEYS.has('phone')).toBe(true)
      expect(PII_KEYS.has('mp_access_token')).toBe(true)
      expect(PII_KEYS.has('authorization')).toBe(true)
    })
  })

  describe('scrubQueryString', () => {
    it('redacts email and token values', () => {
      expect(
        scrubQueryString('?email=user@example.com&id=1'),
      ).toBe('?email=[REDACTED]&id=1')
      expect(
        scrubQueryString('?token=abc123&foo=bar'),
      ).toBe('?token=[REDACTED]&foo=bar')
    })

    it('redacts access_token and refresh_token', () => {
      expect(
        scrubQueryString('?access_token=AT&refresh_token=RT'),
      ).toBe('?access_token=[REDACTED]&refresh_token=[REDACTED]')
    })

    it('preserves non-sensitive params', () => {
      expect(scrubQueryString('?page=2&size=10')).toBe('?page=2&size=10')
    })

    it('case-insensitive', () => {
      expect(scrubQueryString('?Email=a@b.com')).toBe('?Email=[REDACTED]')
    })
  })
})
