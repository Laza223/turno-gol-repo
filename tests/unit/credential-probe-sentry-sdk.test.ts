import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Complemento de credential-probe-sentry.test.ts: aquella prueba el camino
// CRUDO (credencial + red), esta prueba el camino del SDK, que es el que usan
// los ~84 captureException de la app. En producción los dos NO coinciden —el
// crudo entrega y el del SDK no— y sin instrumento no había forma de saber en
// qué eslabón se corta (§19 del doc de auditoría).

const getClient = vi.fn()
const captureMessage = vi.fn()
const flush = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  getClient: () => getClient(),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  flush: (...args: unknown[]) => flush(...args),
}))

const clienteCon = (opciones: Record<string, unknown>) => ({ getOptions: () => opciones })

describe('probeSentrySdk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SENTRY_DSN', 'https://clave@o1.ingest.sentry.io/456')
    getClient.mockReturnValue(clienteCon({ environment: 'production', dsn: 'https://…' }))
    captureMessage.mockReturnValue('event-id')
    flush.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sin la variable: skip, sin tocar el SDK', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    const { probeSentrySdk } = await import('@/shared/observability/credential-probes')
    const r = await probeSentrySdk()
    expect(r.status).toBe('skip')
    expect(getClient).not.toHaveBeenCalled()
  })

  it('sin cliente: fail que nombra la causa (init no corrió en este runtime)', async () => {
    getClient.mockReturnValue(undefined)
    const { probeSentrySdk } = await import('@/shared/observability/credential-probes')
    const r = await probeSentrySdk()
    expect(r.status).toBe('fail')
    expect(r.detail).toMatch(/no dejó un cliente activo/)
    expect(r.detail).toMatch(/instrumentation\.ts/)
    // No manda nada si no hay a dónde.
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('camino feliz: ok, y reporta los datos que hacen falta para diagnosticar', async () => {
    const { probeSentrySdk } = await import('@/shared/observability/credential-probes')
    const r = await probeSentrySdk()
    expect(r.status).toBe('ok')
    expect(r.detail).toContain('environment=production')
    expect(r.detail).toContain('dsn=presente')
    expect(r.detail).toContain('flush=ok')
  })

  it('agrupa con la sonda cruda: mismo fingerprint, un solo issue', async () => {
    const { probeSentrySdk } = await import('@/shared/observability/credential-probes')
    await probeSentrySdk()
    const [, opts] = captureMessage.mock.calls[0] as [string, { fingerprint: string[] }]
    expect(opts.fingerprint).toEqual(['credential-probe-sentry'])
  })

  it('si beforeSend descarta el evento (sin eventId): fail', async () => {
    captureMessage.mockReturnValue(undefined)
    const { probeSentrySdk } = await import('@/shared/observability/credential-probes')
    const r = await probeSentrySdk()
    expect(r.status).toBe('fail')
    expect(r.detail).toMatch(/no entregó/)
    expect(r.detail).toContain('eventId=NO')
  })

  it('si el transporte no termina de mandar: fail con flush incompleto', async () => {
    flush.mockResolvedValue(false)
    const { probeSentrySdk } = await import('@/shared/observability/credential-probes')
    const r = await probeSentrySdk()
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('flush=incompleto')
  })

  it('expone NODE_ENV: es lo que decide el beforeSend que descarta todo', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { probeSentrySdk } = await import('@/shared/observability/credential-probes')
    const r = await probeSentrySdk()
    expect(r.detail).toContain('NODE_ENV=development')
  })
})
