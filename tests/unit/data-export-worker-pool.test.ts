import { beforeEach, describe, expect, it, vi } from 'vitest'

// caza-bugs #8: el dump de compliance (bookings/payments/relaciones/bans) del
// export ARCO corría con getSql() — el pool restringido turnogol_app — fuera
// de todo withTenantContext/withPlayerContext, así que en producción devolvía
// SIEMPRE 0 filas para esas 4 queries (el derecho de acceso Art. 14 quedaba
// incompleto). tests/integration/arco-data-export.test.ts no lo detecta:
// localmente DATABASE_URL y WORKER_DATABASE_URL apuntan al mismo superusuario,
// así que RLS no aplica de por sí y el test pasa igual con getSql() o
// getWorkerSql(). Este test mockea el POOL (no el resultado) para probar el
// cableado, mismo patrón que staff-service-worker-pool.test.ts.

const h = vi.hoisted(() => ({
  getSql: vi.fn(),
  getWorkerSql: vi.fn(),
}))

vi.mock('@/shared/db/client', () => ({
  getSql: h.getSql,
  getWorkerSql: h.getWorkerSql,
}))

vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))

const FAKE_PLAYER_ROW = {
  id: 'player-1',
  email: 'p@test.com',
  firstName: 'Ana',
  lastName: 'Gomez',
  phone: null,
  preferredArea: null,
  status: 'active',
  avatarUrl: null,
  agreedToTermsAt: new Date('2026-01-01'),
  termsVersion: 'v1',
  createdAt: new Date('2026-01-01'),
  lastLoginAt: null,
}

const FAKE_TX = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([FAKE_PLAYER_ROW]),
      }),
    }),
  }),
}

vi.mock('@/shared/middleware/with-player', () => ({
  withPlayer:
    (handler: (req: unknown, user: { playerId: string }, tx: unknown) => unknown) =>
    async (req: unknown) =>
      handler(req, { playerId: 'player-1' }, FAKE_TX),
}))

import { GET } from '@/app/api/player/data-export/route'
import { NextRequest } from 'next/server'

// Trap: una tagged-template function-like que ignora sus args y devuelve
// filas fijas — sirve para simular tanto el pool restringido (0 filas
// simuladas, como haría RLS real) como el pool worker (filas reales).
function makeSqlTag(rows: unknown[]) {
  return (() => Promise.resolve(rows)) as unknown as ReturnType<typeof h.getWorkerSql>
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getSql.mockReturnValue(makeSqlTag([]))
})

describe('GET /api/player/data-export — dump de compliance vía getWorkerSql, nunca getSql', () => {
  it('llama a getWorkerSql para bookings/payments/relaciones/bans, y jamás a getSql', async () => {
    h.getWorkerSql.mockReturnValue(makeSqlTag([]))

    const req = new NextRequest('http://localhost/api/player/data-export')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.profile.id).toBe('player-1')

    expect(h.getWorkerSql).toHaveBeenCalledTimes(1)
    expect(h.getSql).not.toHaveBeenCalled()
  })
})
