import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeSentry } from '@/shared/observability/credential-probes'

// El 2026-08-26/27 se midió 14 días sin un solo evento del runtime de servidor
// en Sentry, con SENTRY_DSN presente pero sin forma de saber si el VALOR sirve
// — Vercel oculta las variables Sensitive incluso al dueño de la cuenta. Esta
// sonda es la única manera de confirmarlo sin pedirle el secreto a nadie.

const DSN_VALIDO = 'https://clave123@o1.ingest.sentry.io/456'

describe('probeSentry', () => {
  const originalDsn = process.env.SENTRY_DSN
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = originalDsn
    vi.unstubAllGlobals()
  })

  it('sin la variable: skip, no llama a fetch', async () => {
    delete process.env.SENTRY_DSN
    const r = await probeSentry()
    expect(r).toEqual({ name: 'sentry', status: 'skip', detail: 'sin probar: falta SENTRY_DSN' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('DSN que no es una URL: fail sin llamar a fetch', async () => {
    process.env.SENTRY_DSN = 'esto-no-es-una-url'
    const r = await probeSentry()
    expect(r.status).toBe('fail')
    expect(r.detail).toMatch(/URL válida/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('URL sin clave pública ni id de proyecto: fail sin llamar a fetch', async () => {
    process.env.SENTRY_DSN = 'https://sentry.io'
    const r = await probeSentry()
    expect(r.status).toBe('fail')
    expect(r.detail).toMatch(/no tiene clave pública/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ingesta acepta el evento (HTTP 200): ok, con host y proyecto en el detalle', async () => {
    process.env.SENTRY_DSN = DSN_VALIDO
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const r = await probeSentry()
    expect(r).toEqual({
      name: 'sentry',
      status: 'ok',
      detail: 'evento de prueba aceptado (host o1.ingest.sentry.io, proyecto 456)',
    })
  })

  it('manda un envelope válido a la URL de ingesta correcta, con la clave pública', async () => {
    process.env.SENTRY_DSN = DSN_VALIDO
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    await probeSentry()

    const [calledUrl, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toBe(
      'https://o1.ingest.sentry.io/api/456/envelope/?sentry_version=7&sentry_key=clave123',
    )
    expect(opts.method).toBe('POST')
    const lines = String(opts.body).split('\n')
    expect(lines).toHaveLength(3)
    const envelopeHeader = JSON.parse(lines[0])
    const itemHeader = JSON.parse(lines[1])
    const payload = JSON.parse(lines[2])
    expect(envelopeHeader.event_id).toMatch(/^[0-9a-f]{32}$/)
    expect(itemHeader).toEqual({ type: 'event', content_type: 'application/json' })
    expect(payload.event_id).toBe(envelopeHeader.event_id)
    // Fingerprint fijo: corridas repetidas agrupan en UN issue, no uno por vez.
    expect(payload.fingerprint).toEqual(['credential-probe-sentry'])
  })

  it('401 (clave rechazada): fail y lo dice explícito', async () => {
    process.env.SENTRY_DSN = DSN_VALIDO
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
    const r = await probeSentry()
    expect(r.status).toBe('fail')
    expect(r.detail).toMatch(/clave rechazada.*401/)
  })

  it('404 (proyecto inexistente): fail y lo dice explícito', async () => {
    process.env.SENTRY_DSN = DSN_VALIDO
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const r = await probeSentry()
    expect(r.status).toBe('fail')
    expect(r.detail).toMatch(/proyecto "456" no existe/)
  })

  it('la ingesta no responde (red caída): fail con el motivo', async () => {
    process.env.SENTRY_DSN = DSN_VALIDO
    fetchMock.mockRejectedValue(new Error('fetch failed'))
    const r = await probeSentry()
    expect(r.status).toBe('fail')
    expect(r.detail).toBe('fetch failed')
  })
})
