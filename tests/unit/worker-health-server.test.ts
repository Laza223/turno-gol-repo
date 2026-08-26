import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El healthcheck del worker (M-5).
 *
 * Lo que protege no es "responde 200": es que responda 200 **solo cuando el
 * worker puede trabajar de verdad**. El 2026-08-25 el proceso estaba vivo,
 * latiendo cada 5 minutos, con todo `withTenantContext` roto — o sea que
 * cualquier chequeo que mire el proceso y no la base habría dado verde durante
 * horas mientras los crons de plata fallaban.
 */

const appSql = vi.fn()
const workerSql = vi.fn()

vi.mock('@/shared/db/client', () => ({
  assertAppDbReachable: () => appSql(),
  getWorkerSql: () => workerSql,
}))

const { runHealthChecks, healthPort } = await import('@/shared/jobs/health-server')

type FakeBoss = { getQueueSize: (q: string) => Promise<number> }
const bossOk = { getQueueSize: async () => 0 } as unknown as Parameters<typeof runHealthChecks>[0]

function bossThatThrows(message: string): Parameters<typeof runHealthChecks>[0] {
  return {
    getQueueSize: async () => {
      throw new Error(message)
    },
  } as unknown as FakeBoss as Parameters<typeof runHealthChecks>[0]
}

const ok = (checks: Awaited<ReturnType<typeof runHealthChecks>>): boolean =>
  checks.every((c) => c.ok)

beforeEach(() => {
  appSql.mockReset()
  workerSql.mockReset()
  appSql.mockResolvedValue([{ '?column?': 1 }])
  workerSql.mockResolvedValue([{ ok: true }])
})

describe('runHealthChecks', () => {
  it('con los dos pools y pg-boss sanos, da verde', async () => {
    expect(ok(await runHealthChecks(bossOk))).toBe(true)
  })

  it('el pool RESTRINGIDO caído lo pone en rojo — el caso del 2026-08-25', async () => {
    // El worker seguía vivo y pg-boss andaba; lo que moría era este pool.
    appSql.mockRejectedValue(new Error('self-signed certificate in certificate chain'))
    const checks = await runHealthChecks(bossOk)
    expect(ok(checks)).toBe(false)
    expect(checks.find((c) => c.name === 'app-pool')?.ok).toBe(false)
    // Y los otros dos siguen verdes: es exactamente el escenario que engañó.
    expect(checks.find((c) => c.name === 'worker-pool')?.ok).toBe(true)
    expect(checks.find((c) => c.name === 'pg-boss')?.ok).toBe(true)
  })

  it('un rol worker sin BYPASSRLS lo pone en rojo', async () => {
    workerSql.mockResolvedValue([{ ok: false }])
    expect(ok(await runHealthChecks(bossOk))).toBe(false)
  })

  it('"permission denied" de pg-boss NO es una falla: es el diseño en producción', async () => {
    // `turnogol_worker` no puede introspeccionar el schema de pg-boss a
    // propósito. Que la consulta llegue hasta el permiso ya prueba que el pool
    // vive. Sin esta rama, el healthcheck daría rojo permanente en producción y
    // ningún deploy entraría nunca.
    const checks = await runHealthChecks(bossThatThrows('permission denied for schema pgboss'))
    expect(ok(checks)).toBe(true)
  })

  it('un error real de pg-boss sí lo pone en rojo', async () => {
    expect(ok(await runHealthChecks(bossThatThrows('connection terminated')))).toBe(false)
  })
})

describe('healthPort', () => {
  it('usa PORT cuando es un puerto válido', () => {
    expect(healthPort({ PORT: '3333' })).toBe(3333)
  })

  it('cae al default con cualquier basura, en vez de quedarse sin servidor', () => {
    for (const PORT of ['', 'abc', '0', '-1', '99999', '80.5']) {
      expect(healthPort({ PORT })).toBe(8080)
    }
    expect(healthPort({})).toBe(8080)
  })
})

describe('el arranque del worker', () => {
  const src = readFileSync('src/shared/jobs/run-workers.ts', 'utf8')

  it('verifica los DOS pools, no solo el del worker', () => {
    // `assertWorkerDbVisibility` solo mira `WORKER_DATABASE_URL`. El pool que
    // se rompió es el otro, y por eso el arranque daba verde con los crons
    // muertos.
    expect(src).toContain('await assertWorkerDbVisibility()')
    expect(src).toContain('await assertAppDbReachable()')
  })

  it('levanta el healthcheck DESPUÉS de registrar las colas', () => {
    // Un 200 con las colas sin consumidor certificaría justo lo que no
    // queremos: un worker que responde y no trabaja.
    expect(src.indexOf('registerAllWorkers')).toBeLessThan(src.indexOf('startHealthServer(boss)'))
  })
})
