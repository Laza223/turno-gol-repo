/**
 * Brecha de PII en trazas: `beforeSend` no ve transacciones, así que la URL completa
 * (con `booking_intent`, `token`, `email`) viajaba en el nombre de la transacción y en
 * los atributos de los spans. Cada caso estuvo ROJO sin `scrubTransaction`.
 */
import { describe, expect, it } from 'vitest'
import { scrubTransaction } from '@/lib/sentry-pii-scrub'

const INTENT = 'eyJhbGci.Zm9vYmFy'
const URL_INTENT = `https://turnogol.app/club-x/reservar?court=c1&date=2099-01-02&booking_intent=${INTENT}`
const URL_TOKEN = 'https://turnogol.app/verify?token=abc123secret&next=/inicio'
const URL_EMAIL = 'https://turnogol.app/login?email=juan%40ejemplo.com&next=/inicio'

function serializado(evento: unknown): string {
  return JSON.stringify(evento)
}

describe('scrubTransaction', () => {
  it.each([
    ['booking_intent', URL_INTENT, INTENT],
    ['token', URL_TOKEN, 'abc123secret'],
    ['email', URL_EMAIL, 'juan%40ejemplo.com'],
  ])('tapa %s en transaction, request y contexts.trace', (_n, url, secreto) => {
    const evento = {
      transaction: `GET ${url}`,
      request: { url, query_string: url.split('?')[1], headers: { referer: url } },
      contexts: { trace: { data: { 'url.full': url, 'http.url': url } } },
    }
    scrubTransaction(evento)

    expect(serializado(evento)).not.toContain(secreto)
    expect(serializado(evento)).toContain('[REDACTED]')
  })

  it('tapa los atributos de los spans (url.full, http.url, http.target, url.query)', () => {
    const evento = {
      spans: [
        {
          description: `GET ${URL_INTENT}`,
          data: {
            'url.full': URL_INTENT,
            'http.url': URL_TOKEN,
            'http.target': '/verify?token=abc123secret',
            'url.query': `court=c1&booking_intent=${INTENT}&email=juan%40ejemplo.com`,
            'http.query': 'token=abc123secret',
          },
        },
      ],
    }
    scrubTransaction(evento)

    const s = serializado(evento)
    for (const secreto of [INTENT, 'abc123secret', 'juan%40ejemplo.com']) {
      expect(s).not.toContain(secreto)
    }
    // url.query llega sin `?`: se tapa igual y no se le agrega el `?`.
    expect(evento.spans[0].data['url.query']).toBe(
      'court=c1&booking_intent=[REDACTED]&email=[REDACTED]',
    )
  })

  it('tapa el vínculo codificado y doble codificado (next= del callback)', () => {
    const evento = {
      transaction: `GET /auth/callback?next=%2Fclub-x%2Freservar%3Fcourt%3Dc1%26booking_intent%3D${INTENT}`,
      spans: [
        {
          description: 'redirect_to',
          data: { 'url.full': `/x?next=%2Freservar%3Fc%3D1%2526booking_intent%253D${INTENT}` },
        },
      ],
    }
    scrubTransaction(evento)

    expect(serializado(evento)).not.toContain(INTENT)
  })

  it('control negativo: conserva el camino y los parámetros que no son PII', () => {
    const evento = {
      transaction: `GET /club-x/reservar?court=c1&date=2099-01-02&booking_intent=${INTENT}`,
      spans: [{ description: 'db', data: { 'url.query': 'court=c1&date=2099-01-02', n: 3 } }],
    }
    scrubTransaction(evento)

    expect(evento.transaction).toBe(
      'GET /club-x/reservar?court=c1&date=2099-01-02&booking_intent=[REDACTED]',
    )
    expect(evento.spans[0].data).toEqual({ 'url.query': 'court=c1&date=2099-01-02', n: 3 })
  })

  it('el valor corta en el espacio: "sss" después del token no se come el texto (\s del template)', () => {
    const evento = { spans: [{ description: 'GET /a?token=sss y sigue', data: {} }] }
    scrubTransaction(evento)

    expect(evento.spans[0].description).toBe('GET /a?token=[REDACTED] y sigue')
  })

  it('una transacción sin spans ni request no rompe', () => {
    expect(() => scrubTransaction({ transaction: 'GET /' })).not.toThrow()
  })
})
