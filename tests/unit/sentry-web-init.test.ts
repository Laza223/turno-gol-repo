import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `instrumentation.ts` NO corre en el runtime de Vercel (medido el 2026-08-27
// con probeSentrySdk), así que el único que llamaba a Sentry.init() nunca se
// ejecutaba y los ~84 captureException del web escribían a un SDK apagado —
// un no-op mudo. Este módulo mueve el encendido al grafo normal de la app,
// igual que initWorkerSentry() en Railway, donde Sentry sí funciona.

const init = vi.fn()
const getClient = vi.fn()
const registerSentryErrorSink = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  init: (...args: unknown[]) => init(...args),
  getClient: () => getClient(),
}))

vi.mock('@/shared/observability/error-sink', () => ({
  registerSentryErrorSink: () => registerSentryErrorSink(),
}))

const DSN = 'https://clave@o1.ingest.sentry.io/456'

type OpcionesInit = {
  dsn: string
  environment?: string
  tracesSampler: (ctx: { name?: string }) => number
  beforeSend: (event: Record<string, unknown>, hint: unknown) => unknown
}

const opcionesDelInit = () => (init.mock.calls[0] as [OpcionesInit])[0]

describe('ensureWebSentry', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    getClient.mockReturnValue(undefined)
    vi.stubEnv('SENTRY_DSN', DSN)
    vi.stubEnv('NODE_ENV', 'production')
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    vi.unstubAllEnvs()
  })

  it('sin cliente y con DSN válido: inicializa y devuelve true', async () => {
    const { ensureWebSentry } = await import('@/shared/observability/sentry-web-init')
    expect(ensureWebSentry()).toBe(true)
    expect(init).toHaveBeenCalledTimes(1)
    expect(opcionesDelInit().dsn).toBe(DSN)
  })

  it('registra el sink de logger.error ANTES del init', async () => {
    const orden: string[] = []
    registerSentryErrorSink.mockImplementation(() => orden.push('sink'))
    init.mockImplementation(() => orden.push('init'))
    const { ensureWebSentry } = await import('@/shared/observability/sentry-web-init')
    ensureWebSentry()
    expect(orden).toEqual(['sink', 'init'])
  })

  it('si YA hay cliente no vuelve a inicializar: no pisa el init del worker', async () => {
    getClient.mockReturnValue({ getOptions: () => ({}) })
    const { ensureWebSentry } = await import('@/shared/observability/sentry-web-init')
    expect(ensureWebSentry()).toBe(true)
    expect(init).not.toHaveBeenCalled()
    expect(registerSentryErrorSink).not.toHaveBeenCalled()
  })

  it('sin DSN: no inicializa, devuelve false y NO avisa (es ausencia, no error)', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    const { ensureWebSentry } = await import('@/shared/observability/sentry-web-init')
    expect(ensureWebSentry()).toBe(false)
    expect(init).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('con DSN inválido: no inicializa y SÍ avisa por console (no process.stderr)', async () => {
    vi.stubEnv('SENTRY_DSN', 'no-es-un-dsn')
    const { ensureWebSentry } = await import('@/shared/observability/sentry-web-init')
    expect(ensureWebSentry()).toBe(false)
    expect(init).not.toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('DSN invalid')
  })

  it('conserva el sampling por ruta que traía sentry.server.config.ts', async () => {
    const { ensureWebSentry } = await import('@/shared/observability/sentry-web-init')
    ensureWebSentry()
    const sampler = opcionesDelInit().tracesSampler
    expect(sampler({ name: 'GET /api/status' })).toBe(0)
    expect(sampler({ name: 'GET /api/health' })).toBe(0)
    expect(sampler({ name: 'POST /api/webhooks/mercadopago' })).toBe(0.5)
    expect(sampler({ name: 'POST /api/bookings' })).toBe(0.3)
    expect(sampler({ name: 'GET /grilla' })).toBe(0.1)
    expect(sampler({})).toBe(0.1)
  })

  it('conserva el scrub de PII: saca cookies, auth y datos del request', async () => {
    const { ensureWebSentry } = await import('@/shared/observability/sentry-web-init')
    ensureWebSentry()
    const evento = {
      request: {
        data: { password: 'secreto' },
        headers: { cookie: 'a=1', Authorization: 'Bearer x', 'user-agent': 'curl' },
      },
      user: { id: 'u1', email: 'alguien@ejemplo.com', ip_address: '1.2.3.4' },
    }
    const salida = opcionesDelInit().beforeSend(evento, {}) as typeof evento

    expect(salida.request.data).toBeUndefined()
    expect(salida.request.headers.cookie).toBeUndefined()
    expect(salida.request.headers.Authorization).toBeUndefined()
    expect(salida.request.headers['user-agent']).toBe('curl')
    // Se conserva el id para poder rastrear, se van email e IP.
    expect(salida.user).toEqual({ id: 'u1' })
  })

  it('fuera de producción descarta TODO evento (mismo criterio de antes)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { ensureWebSentry } = await import('@/shared/observability/sentry-web-init')
    ensureWebSentry()
    expect(opcionesDelInit().beforeSend({}, {})).toBeNull()
  })
})
