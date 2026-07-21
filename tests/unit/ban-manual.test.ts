import { describe, expect, it, vi } from 'vitest'
import { players, tenantPlayerBans } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import {
  banPlayerManually,
  liftPlayerBan,
  checkPlayerBanned,
  getActiveBanReason,
  isGlobalBanActive,
  resolveManualBanUntil,
} from '@/modules/bans/ban.service'

// ENS-8: ban manual del complejo (doc7 Flujo 5B). Reemplaza/extiende el ban
// vigente en vez de duplicar (trigger enforce_single_active_ban, migración
// 005). El fake tx de abajo simula tenant_player_bans + players EN MEMORIA
// para poder ejercitar banPlayerManually/liftPlayerBan/checkPlayerBanned
// REALES sin DB (integración cubierta en vivo, ver contrato).

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const PLAYER_ID = '22222222-2222-4222-8222-222222222222'
const STAFF_ID = '33333333-3333-4333-8333-333333333333'

type FakeBan = {
  id: string
  tenantId: string
  playerId: string
  reason: string
  bannedAt: Date
  bannedUntil: Date | null
  bannedBy: string | null
}

function isVigente(b: FakeBan, now: Date): boolean {
  return b.bannedUntil === null || b.bannedUntil.getTime() > now.getTime()
}

/**
 * Fake tx en memoria: implementa el mismo shape de chain (select/from/where/
 * limit/for, insert/values/returning, update/set/where/returning) que usa
 * ban.service.ts, ruteando por identidad de tabla (players vs
 * tenantPlayerBans). El filtro de vigencia se reimplementa acá (mismo
 * predicado documentado que la SQL real) — la correctitud del WHERE real
 * está verificada en vivo (contrato ENS-8), esto ejercita el control flow.
 */
function makeFakeTx(opts: { playerStatus?: string; playerBanUntil?: Date | null } = {}) {
  const store: FakeBan[] = []
  let seq = 0

  function rowsFor(table: unknown): unknown[] {
    if (table === players) {
      return opts.playerStatus
        ? [{ status: opts.playerStatus, banUntil: opts.playerBanUntil ?? null }]
        : []
    }
    if (table === tenantPlayerBans) {
      const now = new Date()
      return store
        .filter((b) => isVigente(b, now))
        .map((b) => ({ id: b.id, reason: b.reason, bannedUntil: b.bannedUntil }))
    }
    return []
  }

  function chain(table: unknown): unknown {
    const c: Record<string, unknown> = {
      where: vi.fn(() => c),
      limit: vi.fn(() => c),
      for: vi.fn(() => c),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(rowsFor(table)).then(resolve, reject),
    }
    return c
  }

  const tx = {
    select: vi.fn(() => ({ from: vi.fn((table: unknown) => chain(table)) })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((row: Record<string, unknown>) => {
        if (table !== tenantPlayerBans) throw new Error('insert on unexpected table')
        const inserted: FakeBan = {
          id: `ban-${++seq}`,
          tenantId: row.tenantId as string,
          playerId: row.playerId as string,
          reason: row.reason as string,
          bannedAt: (row.bannedAt as Date) ?? new Date(),
          bannedUntil: (row.bannedUntil as Date | null) ?? null,
          bannedBy: (row.bannedBy as string | null) ?? null,
        }
        store.push(inserted)
        return { returning: vi.fn(async () => [inserted]) }
      }),
    })),
    update: vi.fn((table: unknown) => ({
      // El UPDATE de banPlayerManually NO llama a .returning() (no necesita el
      // resultado), así que la mutación tiene que aplicarse ya en .where() —
      // no diferida a .returning() como en liftPlayerBan — y el objeto
      // devuelto por .where() tiene que ser awaitable directo (thenable) Y
      // exponer .returning() para el caso que sí lo usa.
      set: vi.fn((patch: Record<string, unknown>) => ({
        where: vi.fn(() => {
          if (table !== tenantPlayerBans) {
            const empty = Promise.resolve([]) as Promise<unknown> & { returning: () => Promise<unknown[]> }
            empty.returning = () => Promise.resolve([])
            return empty
          }
          const now = new Date()
          const targets = store.filter((b) => isVigente(b, now))
          for (const t of targets) {
            if ('reason' in patch) t.reason = patch.reason as string
            if ('bannedUntil' in patch) {
              const v = patch.bannedUntil
              // sql`NOW()` (liftPlayerBan) llega como un objeto SQL de drizzle,
              // no un Date ni null: se simula como "ahora".
              t.bannedUntil = v === null ? null : v instanceof Date ? v : new Date()
            }
            if ('bannedBy' in patch) t.bannedBy = patch.bannedBy as string | null
            if ('bannedAt' in patch) t.bannedAt = patch.bannedAt as Date
          }
          const rows = targets.map((t) => ({ id: t.id }))
          const result = Promise.resolve(rows) as Promise<unknown> & { returning: () => Promise<unknown[]> }
          result.returning = () => Promise.resolve(rows)
          return result
        }),
      })),
    })),
  }

  return { tx: tx as unknown as DbTx, store }
}

describe('resolveManualBanUntil', () => {
  const now = new Date('2026-07-14T12:00:00Z')

  it('7d → 7 días desde ahora', () => {
    const until = resolveManualBanUntil('7d', now)
    expect(until?.toISOString()).toBe('2026-07-21T12:00:00.000Z')
  })

  it('30d → 30 días desde ahora', () => {
    const until = resolveManualBanUntil('30d', now)
    expect(until?.toISOString()).toBe('2026-08-13T12:00:00.000Z')
  })

  it('indefinite → null', () => {
    expect(resolveManualBanUntil('indefinite', now)).toBeNull()
  })
})

describe('banPlayerManually + checkPlayerBanned', () => {
  it('(a) inserta un ban vigente con el reason dado', async () => {
    const { tx } = makeFakeTx()
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await banPlayerManually(TENANT_ID, PLAYER_ID, STAFF_ID, 'Rotura de vidrios', until, tx)

    const result = await checkPlayerBanned(PLAYER_ID, TENANT_ID, tx)
    expect(result.banned).toBe(true)
    if (result.banned) {
      expect(result.reason).toBe('Rotura de vidrios')
      expect(result.bannedGlobal).toBe(false)
    }
  })

  it('(b) bannedUntil=null (indefinido) queda vigente para checkPlayerBanned', async () => {
    const { tx } = makeFakeTx()

    await banPlayerManually(TENANT_ID, PLAYER_ID, STAFF_ID, 'Conducta violenta', null, tx)

    const result = await checkPlayerBanned(PLAYER_ID, TENANT_ID, tx)
    expect(result.banned).toBe(true)
    if (result.banned) expect(result.until).toBeNull()
  })

  it('(c) liftPlayerBan lo desactiva y checkPlayerBanned deja pasar', async () => {
    const { tx } = makeFakeTx()
    await banPlayerManually(TENANT_ID, PLAYER_ID, STAFF_ID, 'Motivo temporal', null, tx)

    const lifted = await liftPlayerBan(TENANT_ID, PLAYER_ID, tx)
    expect(lifted).toBe(true)

    const result = await checkPlayerBanned(PLAYER_ID, TENANT_ID, tx)
    expect(result.banned).toBe(false)
  })

  it('liftPlayerBan sin ban vigente: no-op, devuelve false', async () => {
    const { tx } = makeFakeTx()
    const lifted = await liftPlayerBan(TENANT_ID, PLAYER_ID, tx)
    expect(lifted).toBe(false)
  })

  it('(d) re-banear con un ban vigente ya existente reemplaza (no duplica filas vigentes)', async () => {
    const { tx, store } = makeFakeTx()
    const until1 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await banPlayerManually(TENANT_ID, PLAYER_ID, STAFF_ID, 'Primer motivo', until1, tx)

    const until2 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await banPlayerManually(TENANT_ID, PLAYER_ID, STAFF_ID, 'Segundo motivo', until2, tx)

    const vigentes = store.filter((b) => b.bannedUntil === null || b.bannedUntil.getTime() > Date.now())
    expect(vigentes).toHaveLength(1)
    expect(vigentes[0]!.reason).toBe('Segundo motivo')
    expect(vigentes[0]!.bannedUntil?.getTime()).toBe(until2.getTime())

    const result = await checkPlayerBanned(PLAYER_ID, TENANT_ID, tx)
    expect(result.banned).toBe(true)
    if (result.banned) expect(result.reason).toBe('Segundo motivo')
  })

  it('un jugador con ban global (players.status=banned) sigue detectándose aparte del ban manual', async () => {
    const { tx } = makeFakeTx({ playerStatus: 'banned' })
    const result = await checkPlayerBanned(PLAYER_ID, TENANT_ID, tx)
    expect(result.banned).toBe(true)
    if (result.banned) expect(result.bannedGlobal).toBe(true)
  })
})

describe('isGlobalBanActive (LOG-11: el ban global temporal debe expirar)', () => {
  const now = new Date('2026-07-21T12:00:00Z')
  const past = new Date('2026-07-20T12:00:00Z')
  const future = new Date('2026-07-22T12:00:00Z')

  it('status=banned + ban_until NULL → vigente (permanente)', () => {
    expect(isGlobalBanActive('banned', null, now)).toBe(true)
  })

  it('status=banned + ban_until futuro → vigente', () => {
    expect(isGlobalBanActive('banned', future, now)).toBe(true)
  })

  it('status=banned + ban_until vencido → NO vigente (era el bug LOG-11)', () => {
    expect(isGlobalBanActive('banned', past, now)).toBe(false)
  })

  it('status=active → nunca vigente, aunque ban_until tenga fecha', () => {
    expect(isGlobalBanActive('active', future, now)).toBe(false)
  })

  it('status=anonymized → nunca vigente', () => {
    expect(isGlobalBanActive('anonymized', null, now)).toBe(false)
  })
})

describe('checkPlayerBanned — ban global temporal (LOG-11)', () => {
  it('ban global con ban_until vencido: NO bloquea (antes bloqueaba para siempre)', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const { tx } = makeFakeTx({ playerStatus: 'banned', playerBanUntil: past })
    const result = await checkPlayerBanned(PLAYER_ID, TENANT_ID, tx)
    expect(result.banned).toBe(false)
  })

  it('ban global con ban_until futuro: bloquea y expone la fecha de fin', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const { tx } = makeFakeTx({ playerStatus: 'banned', playerBanUntil: future })
    const result = await checkPlayerBanned(PLAYER_ID, TENANT_ID, tx)
    expect(result.banned).toBe(true)
    if (result.banned) {
      expect(result.bannedGlobal).toBe(true)
      expect(result.until?.getTime()).toBe(future.getTime())
    }
  })
})

/**
 * R3-5: el checkout público (`(public)/[slug]/reservar/page.tsx`) relee el
 * `reason` real del ban server-side en vez de confiar en el query string
 * `?reason=...` (fabricable por URL, filtraba a logs/analytics/referrers).
 * `getActiveBanReason` es lo que usa esa página.
 */
describe('getActiveBanReason', () => {
  it('devuelve el reason real de un ban manual vigente', async () => {
    const { tx } = makeFakeTx()
    await banPlayerManually(TENANT_ID, PLAYER_ID, STAFF_ID, 'Rotura de vidrios', null, tx)

    const reason = await getActiveBanReason(PLAYER_ID, TENANT_ID, tx)
    expect(reason).toBe('Rotura de vidrios')
  })

  it('devuelve null si no hay ban vigente', async () => {
    const { tx } = makeFakeTx()
    const reason = await getActiveBanReason(PLAYER_ID, TENANT_ID, tx)
    expect(reason).toBeNull()
  })

  it('devuelve null tras levantar el ban (liftPlayerBan)', async () => {
    const { tx } = makeFakeTx()
    await banPlayerManually(TENANT_ID, PLAYER_ID, STAFF_ID, 'Motivo temporal', null, tx)
    await liftPlayerBan(TENANT_ID, PLAYER_ID, tx)

    const reason = await getActiveBanReason(PLAYER_ID, TENANT_ID, tx)
    expect(reason).toBeNull()
  })

  it('ban global (players.status=banned): devuelve el reason fijo del ban global', async () => {
    const { tx } = makeFakeTx({ playerStatus: 'banned' })
    const reason = await getActiveBanReason(PLAYER_ID, TENANT_ID, tx)
    expect(reason).toBe('Jugador suspendido globalmente.')
  })
})
