/**
 * Brecha de PII en trazas: `beforeSend` no ve trazas, así que la URL completa (con
 * `booking_intent`, `token`, `email`) viajaba en el nombre del span y en sus atributos.
 * Desde Sentry 11 los spans viajan de a uno (streaming) y el tapado es `scrubStreamedSpan`,
 * que corre en `beforeSendSpan`.
 */
import { describe, expect, it } from 'vitest'
import { scrubStreamedSpan } from '@/lib/sentry-pii-scrub'

const INTENT = 'eyJhbGci.Zm9vYmFy'
const URL_INTENT = `https://turnogol.app/club-x/reservar?court=c1&date=2099-01-02&booking_intent=${INTENT}`
const URL_TOKEN = 'https://turnogol.app/verify?token=abc123secret&next=/inicio'
const URL_EMAIL = 'https://turnogol.app/login?email=juan%40ejemplo.com&next=/inicio'

function serializado(span: unknown): string {
  return JSON.stringify(span)
}

describe('scrubStreamedSpan', () => {
  it.each([
    ['booking_intent', URL_INTENT, INTENT],
    ['token', URL_TOKEN, 'abc123secret'],
    ['email', URL_EMAIL, 'juan%40ejemplo.com'],
  ])('tapa %s en el nombre y en los atributos', (_n, url, secreto) => {
    const span = {
      name: `GET ${url}`,
      attributes: { 'url.full': url, 'http.url': url, 'url.query': url.split('?')[1] },
    }
    scrubStreamedSpan(span)

    expect(serializado(span)).not.toContain(secreto)
    expect(serializado(span)).toContain('[REDACTED]')
  })

  it('tapa los atributos (url.full, http.url, http.target, url.query, http.query)', () => {
    const span = {
      name: 'GET /club-x/reservar',
      attributes: {
        'url.full': URL_INTENT,
        'http.url': URL_TOKEN,
        'http.target': '/verify?token=abc123secret',
        'url.query': `court=c1&booking_intent=${INTENT}&email=juan%40ejemplo.com`,
        'http.query': 'token=abc123secret',
      },
    }
    scrubStreamedSpan(span)

    const s = serializado(span)
    for (const secreto of [INTENT, 'abc123secret', 'juan%40ejemplo.com']) {
      expect(s).not.toContain(secreto)
    }
    // url.query llega sin `?`: se tapa igual y no se le agrega el `?`.
    expect(span.attributes['url.query']).toBe('court=c1&booking_intent=[REDACTED]&email=[REDACTED]')
  })

  it('tapa los atributos que llegan como { value, unit }', () => {
    const span = {
      name: 'GET /verify',
      attributes: {
        'url.full': { value: URL_TOKEN },
        'url.query': { value: 'token=abc123secret&next=/inicio' },
      },
    }
    scrubStreamedSpan(span)

    expect(serializado(span)).not.toContain('abc123secret')
    expect(span.attributes['url.query']).toEqual({ value: 'token=[REDACTED]&next=/inicio' })
  })

  it('tapa el vínculo codificado y doble codificado (next= del callback)', () => {
    const span = {
      name: `GET /auth/callback?next=%2Fclub-x%2Freservar%3Fcourt%3Dc1%26booking_intent%3D${INTENT}`,
      attributes: {
        'url.full': `/x?next=%2Freservar%3Fc%3D1%2526booking_intent%253D${INTENT}`,
      },
    }
    scrubStreamedSpan(span)

    expect(serializado(span)).not.toContain(INTENT)
  })

  it('control negativo: conserva el camino y los parámetros que no son PII', () => {
    const span = {
      name: `GET /club-x/reservar?court=c1&date=2099-01-02&booking_intent=${INTENT}`,
      attributes: { 'url.query': 'court=c1&date=2099-01-02', n: 3 },
    }
    scrubStreamedSpan(span)

    expect(span.name).toBe(
      'GET /club-x/reservar?court=c1&date=2099-01-02&booking_intent=[REDACTED]',
    )
    expect(span.attributes).toEqual({ 'url.query': 'court=c1&date=2099-01-02', n: 3 })
  })

  it('el valor corta en el espacio: "sss" después del token no se come el texto (\s del template)', () => {
    const span = { name: 'GET /a?token=sss y sigue', attributes: {} }
    scrubStreamedSpan(span)

    expect(span.name).toBe('GET /a?token=[REDACTED] y sigue')
  })

  it('un span sin atributos no rompe', () => {
    expect(() => scrubStreamedSpan({ name: 'GET /', attributes: {} })).not.toThrow()
  })
})
