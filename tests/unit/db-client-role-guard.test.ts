import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('postgres', () => {
  const fakeTx = async () => {}
  fakeTx.unsafe = async () => {}
  return {
    default: () => ({
      begin: async (cb: (tx: typeof fakeTx) => unknown) => cb(fakeTx),
      end: async () => {},
    }),
  }
})

import { withContext } from '@/shared/db/client'

// `getSql()` cachea el cliente en `globalThis` para sobrevivir al doble import
// de Next. `vi.mock` aísla el grafo de módulos de ESTE archivo, pero NO el
// `globalThis`: si cualquier archivo de test que corrió antes abrió el pool, el
// cliente REAL queda ahí y el mock de arriba no se usa nunca. Cuando eso pasó
// (PR #201, CI reproducible al re-correr el mismo commit) el test dejó de medir
// la inyección de SQL y se puso a medir si había Postgres escuchando:
// `expected /Invalid AppRole/ but got 'connect ECONNREFUSED 127.0.0.1:54322'`.
// Limpiarlo acá hace que el archivo mida lo mismo corra en el orden que corra.
beforeEach(() => {
  delete (globalThis as { __turnogolSql?: unknown }).__turnogolSql
})

describe('withContext role allowlist', () => {
  it('rejects role outside the AppRole allowlist (SQL injection guard)', async () => {
    await expect(
      withContext({ role: 'malicious; DROP TABLE users; --' as never }, async () => 'unreachable'),
    ).rejects.toThrow(/Invalid AppRole/i)
  })

  it('rechaza el rol inválido SIN abrir conexión', async () => {
    // El guard corre antes de `getSql()`: un rol que no está en la allowlist no
    // puede consumir un slot del pool ni depender de que la base conteste.
    const abrir = vi.fn()
    await expect(
      withContext({ role: 'otro_rol' as never }, async () => {
        abrir()
        return 'unreachable'
      }),
    ).rejects.toThrow(/Invalid AppRole/i)
    expect(abrir).not.toHaveBeenCalled()
  })

  it('accepts each allowed role without throwing on the guard', async () => {
    for (const role of ['authenticated', 'anon', 'service_role', 'turnogol_app'] as const) {
      const p = withContext({ role }, async () => 'ok')
      await p.catch((e: unknown) => {
        expect(String(e)).not.toMatch(/Invalid AppRole/i)
      })
    }
  })
})
