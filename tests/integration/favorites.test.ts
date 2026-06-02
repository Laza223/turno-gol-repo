import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  closeSql,
  getSql,
  withContext,
  withContextRollback,
  withPlayerContext,
} from '@/shared/db/client'
import {
  getFavorites,
  isFavorite,
  toggleFavorite,
} from '@/modules/favorites/favorite.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      prices: { '60': 800000, '120': 1500000 },
    },
  ],
}

async function insertOnlineCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('favorites service', () => {
  it('toggle on → off y isFavorite refleja el estado', async () => {
    const tenant = await createTestTenant()
    const player = await createTestPlayer()

    await withPlayerContext(player.id, async (tx) => {
      expect(await isFavorite(player.id, tenant.id, tx)).toBe(false)

      const on = await toggleFavorite(player.id, tenant.id, tx)
      expect(on.favorited).toBe(true)
      expect(await isFavorite(player.id, tenant.id, tx)).toBe(true)

      const off = await toggleFavorite(player.id, tenant.id, tx)
      expect(off.favorited).toBe(false)
      expect(await isFavorite(player.id, tenant.id, tx)).toBe(false)
    })
  })

  it('getFavorites lista los complejos con from_price_cents (trigger)', async () => {
    const tenant = await createTestTenant()
    await insertOnlineCourt(tenant.id) // dispara recalc_tenant_from_price → 800000
    const player = await createTestPlayer()

    const favorites = await withPlayerContext(player.id, async (tx) => {
      await toggleFavorite(player.id, tenant.id, tx)
      return getFavorites(player.id, tx)
    })

    expect(favorites).toHaveLength(1)
    expect(favorites[0]!.tenantId).toBe(tenant.id)
    expect(favorites[0]!.slug).toBe(tenant.slug)
    expect(favorites[0]!.fromPriceCents).toBe(800000)
  })
})

describe('favorites RLS', () => {
  it('el jugador solo ve sus propios favoritos', async () => {
    const tenant = await createTestTenant()
    const a = await createTestPlayer()
    const b = await createTestPlayer()
    await withPlayerContext(a.id, (tx) => toggleFavorite(a.id, tenant.id, tx))

    // B no ve el favorito de A.
    const seenByB = await withContext(
      { role: 'authenticated', playerId: b.id },
      (tx) =>
        tx`SELECT id FROM player_favorites WHERE player_id = ${a.id}` as unknown as Promise<
          unknown[]
        >,
    )
    expect((seenByB as unknown as unknown[]).length).toBe(0)

    // A sí lo ve.
    const seenByA = await withContext(
      { role: 'authenticated', playerId: a.id },
      (tx) =>
        tx`SELECT id FROM player_favorites WHERE player_id = ${a.id}` as unknown as Promise<
          unknown[]
        >,
    )
    expect((seenByA as unknown as unknown[]).length).toBe(1)
  })

  it('sin contexto de jugador → 0 filas (fail-safe)', async () => {
    const tenant = await createTestTenant()
    const a = await createTestPlayer()
    await withPlayerContext(a.id, (tx) => toggleFavorite(a.id, tenant.id, tx))

    const rows = await withContext({ role: 'authenticated' }, (tx) =>
      tx`SELECT count(*)::int AS c FROM player_favorites` as unknown as Promise<
        { c: number }[]
      >,
    )
    expect((rows as unknown as { c: number }[])[0]!.c).toBe(0)
  })

  it('no puede insertar un favorito a nombre de otro jugador (WITH CHECK)', async () => {
    const tenant = await createTestTenant()
    const a = await createTestPlayer()
    const b = await createTestPlayer()

    await expect(
      withContextRollback({ role: 'authenticated', playerId: a.id }, (tx) =>
        tx`
          INSERT INTO player_favorites (player_id, tenant_id)
          VALUES (${b.id}, ${tenant.id})
        `,
      ),
    ).rejects.toThrow()
  })

  it('no puede borrar el favorito de otro jugador (DELETE policy)', async () => {
    const tenant = await createTestTenant()
    const a = await createTestPlayer()
    const b = await createTestPlayer()
    await withPlayerContext(a.id, (tx) => toggleFavorite(a.id, tenant.id, tx))

    // B intenta borrar el favorito de A → la policy USING filtra: 0 filas afectadas.
    const deleted = await withContextRollback(
      { role: 'authenticated', playerId: b.id },
      (tx) =>
        tx`DELETE FROM player_favorites WHERE player_id = ${a.id} RETURNING id` as unknown as Promise<
          unknown[]
        >,
    )
    expect((deleted as unknown as unknown[]).length).toBe(0)
  })
})
