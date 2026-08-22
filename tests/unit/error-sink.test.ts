import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import { logger, setErrorSink } from '@/shared/lib/logger'
import { registerSentryErrorSink } from '@/shared/observability/error-sink'

// Sin `Sentry.init()` real, `captureMessage` es un no-op silencioso: sin este
// mock el test no podría distinguir "reportó" de "no reportó".
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))

afterEach(() => {
  setErrorSink(null)
  vi.mocked(Sentry.captureMessage).mockReset()
  vi.restoreAllMocks()
})

function silenciarStderr(): void {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
}

describe('registerSentryErrorSink', () => {
  it('hace que un logger.error termine en Sentry, con nivel error', () => {
    silenciarStderr()
    registerSentryErrorSink()

    logger.error('retry-refunds: settle failed', { tenantId: 't-1' })

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    const [mensaje, opciones] = vi.mocked(Sentry.captureMessage).mock.calls[0]!
    expect(mensaje).toBe('retry-refunds: settle failed')
    expect(opciones).toMatchObject({ level: 'error' })
  })

  it('manda la entrada por `extra`, que es lo único que pasa por el scrub de PII', () => {
    silenciarStderr()
    registerSentryErrorSink()

    logger.error('fallo de MP', {
      tenantId: 't-1',
      error: 'At least one policy returned UNAUTHORIZED',
    })

    const [, opciones] = vi.mocked(Sentry.captureMessage).mock.calls[0]!
    const extra = (opciones as { extra: Record<string, unknown> }).extra
    expect(extra.tenantId).toBe('t-1')
    expect(extra.error).toBe('At least one policy returned UNAUTHORIZED')
  })

  it('el mensaje va sin interpolar, para que Sentry agrupe por tipo de fallo', () => {
    silenciarStderr()
    registerSentryErrorSink()

    logger.error('retry-refunds: settle failed', { refundPaymentId: 'a' })
    logger.error('retry-refunds: settle failed', { refundPaymentId: 'b' })

    const mensajes = vi.mocked(Sentry.captureMessage).mock.calls.map(([m]) => m)
    expect(new Set(mensajes).size).toBe(1)
  })
})
