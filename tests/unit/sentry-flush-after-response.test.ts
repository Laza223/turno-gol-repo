import { beforeEach, describe, expect, it, vi } from 'vitest'

// El simulacro de P-12 (2026-08-26) mostró captureException disparando sin
// que el evento llegara a Sentry: nadie esperaba el flush antes de que la
// función serverless se congelara. Este archivo prueba el fix (after() +
// Sentry.flush) contra la implementación REAL de src/lib/sentry.ts — no la
// mockea entera como hacen el resto de los tests del repo.

const captureExceptionMock = vi.fn((..._args: unknown[]) => 'event-id-exception')
const captureMessageMock = vi.fn((..._args: unknown[]) => 'event-id-message')
const flushMock = vi.fn((..._args: unknown[]) => Promise.resolve(true))
// El encendido del SDK, que es lo que le faltaba al web en Vercel: se mockea
// para que este archivo siga midiendo SOLO el flush, y se verifica aparte que
// se llame antes de capturar.
const ensureWebSentryMock = vi.fn(() => true)

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
  flush: (...args: unknown[]) => flushMock(...args),
}))

vi.mock('@/shared/observability/sentry-web-init', () => ({
  ensureWebSentry: () => ensureWebSentryMock(),
}))

// after() real corre el callback tras la response; acá se simula ejecutándolo
// inline salvo que el test pida el caso "fuera de request scope" (workers).
let afterImpl: (cb: () => void) => void = (cb) => cb()

vi.mock('next/server', () => ({
  after: (cb: () => void) => afterImpl(cb),
}))

describe('src/lib/sentry.ts — flush antes de que la función se congele', () => {
  beforeEach(() => {
    captureExceptionMock.mockClear()
    captureMessageMock.mockClear()
    flushMock.mockClear()
    ensureWebSentryMock.mockClear()
    afterImpl = (cb) => cb()
  })

  it('enciende el SDK ANTES de capturar: sin eso, capturar es un no-op mudo', async () => {
    // La causa medida del silencio de producción: instrumentation.ts no corre
    // en Vercel, así que nadie llamaba a Sentry.init(). Sin este encendido,
    // los ~84 call sites del web escriben a un SDK apagado y nada falla.
    const orden: string[] = []
    ensureWebSentryMock.mockImplementation(() => {
      orden.push('ensure')
      return true
    })
    captureExceptionMock.mockImplementation(() => {
      orden.push('capture')
      return 'event-id-exception'
    })
    const { captureException } = await import('@/lib/sentry')

    captureException(new Error('boom'))

    expect(orden).toEqual(['ensure', 'capture'])
  })

  it('captureMessage también lo enciende', async () => {
    const { captureMessage } = await import('@/lib/sentry')
    captureMessage('algo')
    expect(ensureWebSentryMock).toHaveBeenCalled()
  })

  it('captureException delega en Sentry.captureException y devuelve el eventId', async () => {
    const { captureException } = await import('@/lib/sentry')
    const err = new Error('boom')

    const eventId = captureException(err)

    expect(captureExceptionMock).toHaveBeenCalledWith(err)
    expect(eventId).toBe('event-id-exception')
  })

  it('captureException agenda Sentry.flush(2000) vía after()', async () => {
    const { captureException } = await import('@/lib/sentry')

    captureException(new Error('boom'))

    expect(flushMock).toHaveBeenCalledWith(2000)
  })

  it('captureMessage también agenda el flush', async () => {
    const { captureMessage } = await import('@/lib/sentry')

    const eventId = captureMessage('algo raro')

    expect(captureMessageMock).toHaveBeenCalledWith('algo raro')
    expect(flushMock).toHaveBeenCalledWith(2000)
    expect(eventId).toBe('event-id-message')
  })

  it('pasa el segundo argumento (hint) a Sentry.captureException sin tocarlo', async () => {
    const { captureException } = await import('@/lib/sentry')
    const err = new Error('boom')
    const hint = { tags: { area: 'status' } }

    captureException(err, hint)

    expect(captureExceptionMock).toHaveBeenCalledWith(err, hint)
  })

  it('si after() tira "outside a request scope" (caso workers), no rompe y no fuerza el flush', async () => {
    afterImpl = () => {
      throw new Error('after() was called outside a request scope')
    }
    const { captureException } = await import('@/lib/sentry')

    const eventId = captureException(new Error('boom'))

    expect(eventId).toBe('event-id-exception')
    expect(flushMock).not.toHaveBeenCalled()
  })
})
