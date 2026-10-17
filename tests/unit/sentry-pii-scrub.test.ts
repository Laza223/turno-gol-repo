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
      expect(scrubQueryString('?email=user@example.com&id=1')).toBe('?email=[REDACTED]&id=1')
      expect(scrubQueryString('?token=abc123&foo=bar')).toBe('?token=[REDACTED]&foo=bar')
    })

    it('redacts access_token and refresh_token', () => {
      expect(scrubQueryString('?access_token=AT&refresh_token=RT')).toBe(
        '?access_token=[REDACTED]&refresh_token=[REDACTED]',
      )
    })

    it('preserves non-sensitive params', () => {
      expect(scrubQueryString('?page=2&size=10')).toBe('?page=2&size=10')
    })

    it('case-insensitive', () => {
      expect(scrubQueryString('?Email=a@b.com')).toBe('?Email=[REDACTED]')
    })

    // Hallazgo #7 (campaña de mutación, docs/qa/TEST_AUDIT.md): PII_KEYS y el
    // regex de acá tenían DOS listas separadas. `mp_access_token` está en
    // PII_KEYS (es justo la credencial que CLAUDE.md prohíbe loguear) pero el
    // regex viejo solo reconocía el término `access_token` pegado a `?`/`&` —
    // el prefijo `mp_` rompe esa adyacencia y el patrón nunca matchea.
    it('redacta mp_access_token y mp_refresh_token (el patrón sale de PII_KEYS, no de una lista aparte)', () => {
      expect(scrubQueryString('?mp_access_token=TEST-1234&id=1')).toBe(
        '?mp_access_token=[REDACTED]&id=1',
      )
      expect(scrubQueryString('?mp_refresh_token=TG-xyz&foo=bar')).toBe(
        '?mp_refresh_token=[REDACTED]&foo=bar',
      )
    })

    // El vínculo que confirma la reserva sola viaja en el `next` del magic link: es una credencial
    // de un solo turno ligada a un email, y no tiene que quedar en el reporte de errores.
    it('redacta booking_intent, en el query string y como clave de un objeto', () => {
      expect(scrubQueryString('/club-x/reservar?court=c1&booking_intent=abc.def&dur=60')).toBe(
        '/club-x/reservar?court=c1&booking_intent=[REDACTED]&dur=60',
      )
      expect(scrubObject({ booking_intent: 'abc.def', court: 'c1' })).toEqual({
        booking_intent: '[REDACTED]',
        court: 'c1',
      })
    })

    // Dentro del `next=` del callback el vínculo viaja codificado: el `&` y el `=` son `%26` y `%3D`,
    // y el patrón de `?k=v` no lo ve.
    it('redacta booking_intent también dentro de un next= codificado', () => {
      const token = 'eyJzbHVnIjoiY2x1Yi14In0.Zm9vLWJhcl9iYXo'
      const qs = `next=%2Fclub-x%2Freservar%3Fcourt%3Dc1%26time%3D21%3A00%26booking_intent%3D${token}&via=email`
      const out = scrubQueryString(qs)

      expect(out).not.toContain(token)
      expect(out).toBe(
        'next=%2Fclub-x%2Freservar%3Fcourt%3Dc1%26time%3D21%3A00%26booking_intent%3D[REDACTED]&via=email',
      )
      // Con el hex en minúscula y al final del string también.
      expect(scrubQueryString(`next=%2Fx%26booking_intent%3d${token}`)).not.toContain(token)
    })

    // Un token real es base64url: lleva `-` y `_` (más de la mitad de los firmados). El de arriba no.
    it('redacta un token con - y _ entero, en claro, codificado y doble codificado', () => {
      const token = 'eyJzbHVnIjoiY2x1Yi14In0-_Q.Zm9v-YmFy_YmF6'
      expect(scrubQueryString(`/x/reservar?booking_intent=${token}`)).toBe(
        '/x/reservar?booking_intent=[REDACTED]',
      )
      expect(scrubQueryString(`next=%2Fx%26booking_intent%3D${token}`)).toBe(
        'next=%2Fx%26booking_intent%3D[REDACTED]',
      )
      // El `redirect_to` que `@supabase/auth-js` manda al pedir el enlace lo lleva doble codificado.
      expect(
        scrubQueryString(`redirect_to=%2Fcb%3Fnext%3D%252Fx%2526booking_intent%253D${token}`),
      ).toBe('redirect_to=%2Fcb%3Fnext%3D%252Fx%2526booking_intent%253D[REDACTED]')
    })

    it('la forma codificada solo se come el token: lo que viene después queda', () => {
      expect(scrubQueryString('next=%2Fx%26booking_intent%3Dabc.def%26utm%3Dig')).toBe(
        'next=%2Fx%26booking_intent%3D[REDACTED]%26utm%3Dig',
      )
    })

    it('redacta el resto de PII_KEYS que el regex viejo no cubría (phone, phone_number, dni)', () => {
      expect(scrubQueryString('?phone=+5491100000000')).toBe('?phone=[REDACTED]')
      expect(scrubQueryString('?phone_number=+5491100000000')).toBe('?phone_number=[REDACTED]')
      expect(scrubQueryString('?dni=30111222')).toBe('?dni=[REDACTED]')
    })
  })
})
