import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-15: "/super-admin queda cargando". Una query del pool worker quedó
// colgada en el pooler (backend `active`/`ClientRead` más de 7 min) y, en el
// pool COMPARTIDO de 3 conexiones por instancia, esa conexión no se soltaba
// nunca: el dashboard se quedaba sin lugar y la page caía a los 15 s, o la
// request seguía hasta los 300 s de Vercel. Estos tests fijan que
// `withDisposableWorkerDb` abre un cliente propio, lo corta al vencer el tope y
// lo cierra siempre, sin tocar el pool compartido.

const h = vi.hoisted(() => ({
  postgres: vi.fn(),
  end: vi.fn(),
}))

vi.mock('postgres', () => ({ default: h.postgres }))
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: () => ({ fake: 'db' }) }))

import { withDisposableWorkerDb } from '@/shared/db/client'

beforeEach(() => {
  vi.clearAllMocks()
  h.end.mockResolvedValue(undefined)
  h.postgres.mockImplementation(() => ({
    options: { serializers: {} as Record<string, unknown> },
    end: h.end,
  }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('withDisposableWorkerDb', () => {
  it('devuelve el resultado de fn y cierra su cliente al terminar', async () => {
    const result = await withDisposableWorkerDb(1_000, async (db) => {
      expect(db).toEqual({ fake: 'db' })
      return 42
    })

    expect(result).toBe(42)
    expect(h.postgres).toHaveBeenCalledTimes(1)
    expect(h.end).toHaveBeenCalledWith({ timeout: 0 })
  })

  it('si fn no vuelve nunca, rechaza pasado el tope y corta el cliente', async () => {
    vi.useFakeTimers()

    const pending = withDisposableWorkerDb(10_000, () => new Promise<never>(() => {}))
    const settled = pending.catch((err: unknown) => err)
    await vi.advanceTimersByTimeAsync(10_100)

    const err = await settled
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).name).toBe('TimeoutError')
    expect(h.end).toHaveBeenCalledWith({ timeout: 0 })
  })

  it('si fn falla, propaga el error y cierra el cliente igual', async () => {
    await expect(
      withDisposableWorkerDb(1_000, async () => {
        throw new Error('permission denied')
      }),
    ).rejects.toThrow('permission denied')
    expect(h.end).toHaveBeenCalledWith({ timeout: 0 })
  })

  it('cada llamada abre su propio cliente: un cuelgue no queda en un pool compartido', async () => {
    await withDisposableWorkerDb(1_000, async () => 1)
    await withDisposableWorkerDb(1_000, async () => 2)

    expect(h.postgres).toHaveBeenCalledTimes(2)
    expect(h.end).toHaveBeenCalledTimes(2)
  })

  it('un end() que falla no rompe al caller', async () => {
    h.end.mockRejectedValue(new Error('socket already closed'))

    await expect(withDisposableWorkerDb(1_000, async () => 'ok')).resolves.toBe('ok')
  })
})
