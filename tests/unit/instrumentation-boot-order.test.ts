import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El 2026-08-26 se midió que producción no reportaba UN SOLO error de servidor:
// `validateServerEnv()` corría PRIMERO en `register()`, y al tirar se llevaba
// puesto el init de Sentry y el sink de analytics — sin que nadie se enterara,
// porque el que avisa era justo el que no había arrancado.
// Estos tests anclan el orden y el ruido.

const orden: string[] = []

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => {
    orden.push('sentry.captureException')
    return (capturados.push(args), 'event-id')
  },
  captureRequestError: vi.fn(),
}))

const capturados: unknown[][] = []

vi.mock('../../sentry.server.config', () => {
  orden.push('sentry.init')
  return {}
})

vi.mock('@/shared/validation/zod-locale', () => ({
  installZodLocale: () => {
    orden.push('zod.locale')
  },
}))

vi.mock('@/shared/observability/breadcrumbs', () => ({
  setAnalyticsSink: () => {
    orden.push('analytics.sink')
  },
}))

vi.mock('@/shared/observability/analytics', () => ({ recordEvent: vi.fn() }))

let envTira = false

vi.mock('@/shared/env', () => ({
  validateServerEnv: () => {
    orden.push('validate.env')
    if (envTira) throw new Error('Invalid environment: R2_BUCKET: required')
    return {}
  },
}))

const runtimeOriginal = process.env.NEXT_RUNTIME

describe('instrumentation register() — orden de arranque', () => {
  // `process.stderr.write` tiene overloads, así que el tipo que infiere
  // `vi.spyOn` no encaja en el genérico por defecto de MockInstance.
  let stderr: { mock: { calls: unknown[][] }; mockRestore: () => void }

  beforeEach(() => {
    orden.length = 0
    capturados.length = 0
    envTira = false
    process.env.NEXT_RUNTIME = 'nodejs'
    vi.resetModules()
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stderr.mockRestore()
    if (runtimeOriginal === undefined) delete process.env.NEXT_RUNTIME
    else process.env.NEXT_RUNTIME = runtimeOriginal
  })

  // VA PRIMERO A PROPÓSITO: el factory de `vi.mock('../../sentry.server.config')`
  // se ejecuta UNA sola vez por archivo (el registro de mocks sobrevive a
  // `vi.resetModules()`), así que 'sentry.init' solo se registra en el primer
  // `register()` del archivo. Vitest corre los tests en orden de declaración.
  it('enciende Sentry primero y deja la validación del entorno para el final', async () => {
    const { register } = await import('../../instrumentation')
    await register()

    expect(orden).toEqual(['sentry.init', 'zod.locale', 'analytics.sink', 'validate.env'])
  })

  it('si el entorno es inválido, el sink de analytics YA quedó cableado', async () => {
    envTira = true
    const { register } = await import('../../instrumentation')

    await expect(register()).rejects.toThrow('Invalid environment')
    expect(orden).toContain('analytics.sink')
    expect(orden).toContain('zod.locale')
  })

  it('un entorno inválido se reporta a Sentry y a stderr, y sigue tirando', async () => {
    envTira = true
    const { register } = await import('../../instrumentation')

    await expect(register()).rejects.toThrow('Invalid environment')

    expect(capturados).toHaveLength(1)
    const escrito = stderr.mock.calls.map((c) => String(c[0])).join('')
    expect(escrito).toContain('server env invalid')
    expect(escrito).toContain('R2_BUCKET')
  })

  it('en el camino feliz deja constancia de que register() corrió', async () => {
    const { register } = await import('../../instrumentation')
    await register()

    const escrito = stderr.mock.calls.map((c) => String(c[0])).join('')
    expect(escrito).toContain('instrumentation ok')
    expect(capturados).toHaveLength(0)
  })
})
