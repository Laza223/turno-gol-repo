import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Bloquea la regresión que dejó a producción SIN reporte de errores de servidor
 * desde el primer día.
 *
 * `register()` validaba el env ANTES de importar `sentry.server.config`. Como
 * `ENCRYPTION_KEY` no estaba seteada en Production, la validación tiraba, la
 * función cortaba y Sentry nunca se inicializaba en el servidor. Se descubrió
 * el 2026-07-31: 14 días de issues, 8 en total, todos del navegador — incluido
 * el día en que un 500 en /api/mp/callback impedía conectar MercadoPago.
 *
 * Lo que se protege son dos cosas distintas: el ORDEN (Sentry primero) y que la
 * validación NO relance.
 */

const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (e: unknown) => captureException(e),
  captureRequestError: vi.fn(),
}))

const cargados: string[] = []
const validateServerEnv = vi.fn()

vi.mock('../../sentry.server.config', () => {
  cargados.push('sentry.server.config')
  return {}
})
vi.mock('../../sentry.edge.config', () => {
  cargados.push('sentry.edge.config')
  return {}
})
vi.mock('../../src/shared/env', () => {
  cargados.push('env')
  return { validateServerEnv: (e: unknown) => validateServerEnv(e) }
})

const RUNTIME_ORIGINAL = process.env.NEXT_RUNTIME

beforeEach(() => {
  // `resetModules` es imprescindible: las factories de `vi.mock` corren UNA vez
  // por módulo, así que sin esto `cargados` solo registraría el primer test y
  // los demás verían un array vacío. `resetAllMocks` (y no `clearAllMocks`)
  // porque hace falta borrar la implementación que instala el test del entorno
  // roto, no solo el historial de llamadas.
  vi.resetModules()
  vi.resetAllMocks()
  cargados.length = 0
  process.env.NEXT_RUNTIME = 'nodejs'
})

afterEach(() => {
  if (RUNTIME_ORIGINAL === undefined) delete process.env.NEXT_RUNTIME
  else process.env.NEXT_RUNTIME = RUNTIME_ORIGINAL
})

describe('register() de instrumentation.ts', () => {
  it('inicializa Sentry ANTES de validar el entorno', async () => {
    const { register } = await import('../../instrumentation')
    await register()

    expect(cargados).toContain('sentry.server.config')
    expect(cargados.indexOf('sentry.server.config')).toBeLessThan(cargados.indexOf('env'))
  })

  it('con el entorno roto NO tira, y Sentry queda igual inicializado', async () => {
    // El caso exacto de producción: faltaba ENCRYPTION_KEY.
    validateServerEnv.mockImplementation(() => {
      throw new Error('Invalid environment: ENCRYPTION_KEY: Required')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { register } = await import('../../instrumentation')

    await expect(register()).resolves.not.toThrow()

    // Que haya llegado a validar prueba que pasó el import de Sentry, que en el
    // código va antes. El ORDEN lo fija el primer test de este archivo; acá lo
    // que importa es que la excepción no corta nada.
    expect(validateServerEnv).toHaveBeenCalledTimes(1)
    // Y el problema no se pierde: se reporta por el canal que quedó vivo.
    expect(captureException).toHaveBeenCalledTimes(1)
    expect((captureException.mock.calls[0]![0] as Error).message).toMatch(/ENCRYPTION_KEY/)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('con el entorno sano no reporta nada', async () => {
    const { register } = await import('../../instrumentation')
    await register()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('en runtime edge carga solo la config de edge', async () => {
    process.env.NEXT_RUNTIME = 'edge'
    const { register } = await import('../../instrumentation')
    await register()

    expect(cargados).toEqual(['sentry.edge.config'])
    expect(validateServerEnv).not.toHaveBeenCalled()
  })
})
