import { readFileSync } from 'node:fs'
import path from 'node:path'
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
  // Se espía `console`, NO `process.stderr`: este archivo se compila también
  // para el runtime edge, donde `process.stderr` no existe — usarlo rompía el
  // `valueInjectionLoader` de @sentry/nextjs en el build de Turbopack.
  let consoleError: ReturnType<typeof vi.spyOn>
  let consoleInfo: ReturnType<typeof vi.spyOn>

  const loguedo = () =>
    [...consoleError.mock.calls, ...consoleInfo.mock.calls].map((c) => String(c[0])).join('')

  beforeEach(() => {
    orden.length = 0
    capturados.length = 0
    envTira = false
    process.env.NEXT_RUNTIME = 'nodejs'
    vi.resetModules()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
    consoleInfo.mockRestore()
    if (runtimeOriginal === undefined) delete process.env.NEXT_RUNTIME
    else process.env.NEXT_RUNTIME = runtimeOriginal
  })

  it('no usa process.stderr: el archivo también se compila para el runtime edge', () => {
    // Guard de regresión: con `process.stderr.write` acá, Turbopack avisaba
    // "A Node.js API is used" y el valueInjectionLoader de @sentry/nextjs
    // fallaba al transformar este archivo — el intento de arreglar la
    // observabilidad rompía la instrumentación de Sentry en el build.
    // Se miran solo las líneas de CÓDIGO: el docstring del archivo nombra
    // `process.stderr` justamente para explicar por qué no se usa.
    const codigo = readFileSync(path.resolve(process.cwd(), 'instrumentation.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(codigo).not.toContain('process.stderr')
    expect(codigo).not.toContain('process.stdout')
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

  it('un entorno inválido se reporta a Sentry y al log, y sigue tirando', async () => {
    envTira = true
    const { register } = await import('../../instrumentation')

    await expect(register()).rejects.toThrow('Invalid environment')

    expect(capturados).toHaveLength(1)
    // El nombre de la variable que falló, nunca su valor.
    expect(loguedo()).toContain('server env invalid')
    expect(loguedo()).toContain('R2_BUCKET')
    expect(consoleError).toHaveBeenCalled()
  })

  it('en el camino feliz deja constancia de que register() corrió', async () => {
    const { register } = await import('../../instrumentation')
    await register()

    expect(loguedo()).toContain('instrumentation ok')
    expect(capturados).toHaveLength(0)
  })
})
