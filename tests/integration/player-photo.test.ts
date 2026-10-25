import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { adminSql } from '../helpers/admin-db'
import { cleanupAll, createTestPlayer, ensureRoles } from '../helpers/tenant'

// R2 mockeado: se prueba el ORDEN de la saga contra una base real. `events` es la
// bitácora de put/delete; el `deleteImage` mockeado además mira con OTRA conexión
// (adminSql, pool distinto del worker) qué ve la base en ese instante.
const BASE = 'https://media.turnogol.test'
const h = vi.hoisted(() => ({
  events: [] as string[],
  seenAtDelete: new Map<string, string>(),
  playerId: '',
  putImage: vi.fn(),
  deleteImage: vi.fn(),
}))

vi.mock('@/shared/storage/r2', () => ({
  putImage: h.putImage,
  deleteImage: h.deleteImage,
  listImages: vi.fn(),
  publicUrl: (key: string) => `${BASE}/${key}`,
  isR2Configured: () => true,
}))

import { removePlayerPhoto, setPlayerPhoto } from '@/modules/players/player-photo.service'
import { anonymizePlayer } from '@/modules/players/player.anonymization'

let sql: ReturnType<typeof getSql>

beforeAll(async () => {
  sql = getSql()
  await ensureRoles(sql)
})
beforeEach(async () => {
  // `unstubEnvs` (vitest.config) lo deshace antes de cada test: va acá y no en beforeAll.
  vi.stubEnv('R2_PUBLIC_BASE_URL', BASE)
  await cleanupAll(sql)
  h.events.length = 0
  h.seenAtDelete.clear()
  h.putImage.mockReset().mockImplementation(async (key: string) => {
    h.events.push(`put:${key}`)
  })
  h.deleteImage.mockReset().mockImplementation(async (key: string) => {
    // Otra conexión: ve solo lo ya commiteado.
    const rows = await adminSql()<{ avatar_url: string | null; status: string }[]>`
      SELECT avatar_url, status FROM players WHERE id = ${h.playerId}
    `
    h.seenAtDelete.set(key, `${rows[0]?.status}|${rows[0]?.avatar_url ?? 'null'}`)
    h.events.push(`delete:${key}`)
  })
})
afterAll(async () => {
  await cleanupAll(sql)
  await closeSql()
})

const WEBP = Uint8Array.from([
  ...Array.from('RIFF', (c) => c.charCodeAt(0)),
  0x1a,
  0,
  0,
  0,
  ...Array.from('WEBPVP8 ', (c) => c.charCodeAt(0)),
])

async function avatarOf(id: string): Promise<string | null> {
  const rows = await sql<{ avatar_url: string | null }[]>`
    SELECT avatar_url FROM players WHERE id = ${id}
  `
  return rows[0]!.avatar_url
}

describe('setPlayerPhoto', () => {
  it('reemplazo: put nueva -> UPDATE -> delete de la vieja (ya commiteado)', async () => {
    const player = await createTestPlayer(sql)
    h.playerId = player.id
    const oldKey = 'rival/avatars/old.webp'
    await sql`UPDATE players SET avatar_url = ${`${BASE}/${oldKey}`} WHERE id = ${player.id}`

    const url = await setPlayerPhoto(player.id, WEBP)

    const newKey = url.slice(BASE.length + 1)
    expect(newKey).toMatch(/^rival\/avatars\/[0-9a-f-]{36}\.webp$/)
    expect(h.putImage).toHaveBeenCalledWith(newKey, WEBP, 'image/webp', {
      cacheControl: 'public, max-age=3600',
    })
    expect(h.events).toEqual([`put:${newKey}`, `delete:${oldKey}`])
    // Al borrar la vieja, otra conexión ya veía la nueva URL.
    expect(h.seenAtDelete.get(oldKey)).toBe(`active|${url}`)
    expect(await avatarOf(player.id)).toBe(url)
  })

  it('sin foto previa: solo put y UPDATE', async () => {
    const player = await createTestPlayer(sql)
    h.playerId = player.id
    const url = await setPlayerPhoto(player.id, WEBP)
    expect(h.deleteImage).not.toHaveBeenCalled()
    expect(await avatarOf(player.id)).toBe(url)
  })

  it('si la tx falla (jugador anonimizado) compensa borrando la nueva y relanza', async () => {
    const player = await createTestPlayer(sql)
    h.playerId = player.id
    await anonymizePlayer(player.id)
    h.events.length = 0

    await expect(setPlayerPhoto(player.id, WEBP)).rejects.toThrow(/cannot have a photo/)

    const putKey = h.putImage.mock.calls[0]![0] as string
    expect(h.events).toEqual([`put:${putKey}`, `delete:${putKey}`])
    expect(await avatarOf(player.id)).toBeNull()
  })

  it('jugador inexistente: error de dominio y compensación', async () => {
    await expect(setPlayerPhoto('00000000-0000-0000-0000-000000000001', WEBP)).rejects.toThrow(
      /cannot have a photo/,
    )
    expect(h.deleteImage).toHaveBeenCalledTimes(1)
  })

  it('jugador baneado (global): no escribe', async () => {
    const player = await createTestPlayer(sql)
    h.playerId = player.id
    await sql`UPDATE players SET status = 'banned' WHERE id = ${player.id}`
    await expect(setPlayerPhoto(player.id, WEBP)).rejects.toThrow(/cannot have a photo/)
    expect(await avatarOf(player.id)).toBeNull()
    expect(h.deleteImage).toHaveBeenCalledTimes(1)
  })
})

describe('removePlayerPhoto', () => {
  it('deja NULL y borra el objeto después del commit', async () => {
    const player = await createTestPlayer(sql)
    h.playerId = player.id
    const key = 'rival/avatars/mine.webp'
    await sql`UPDATE players SET avatar_url = ${`${BASE}/${key}`} WHERE id = ${player.id}`

    await removePlayerPhoto(player.id)

    expect(await avatarOf(player.id)).toBeNull()
    expect(h.events).toEqual([`delete:${key}`])
    expect(h.seenAtDelete.get(key)).toBe('active|null')
  })

  it('es idempotente si ya no tenía foto', async () => {
    const player = await createTestPlayer(sql)
    await removePlayerPhoto(player.id)
    await removePlayerPhoto(player.id)
    expect(h.deleteImage).not.toHaveBeenCalled()
  })
})

describe('ARCO + foto en R2', () => {
  it('borra el objeto recién DESPUÉS del commit', async () => {
    const player = await createTestPlayer(sql)
    h.playerId = player.id
    const key = 'rival/avatars/arco.webp'
    await sql`UPDATE players SET avatar_url = ${`${BASE}/${key}`} WHERE id = ${player.id}`

    await anonymizePlayer(player.id)

    expect(h.events).toEqual([`delete:${key}`])
    // Otra conexión ya veía al jugador anonimizado y sin avatar en ese instante.
    expect(h.seenAtDelete.get(key)).toBe('anonymized|null')
  })

  it('no borra nada si la anonimización falla (rollback)', async () => {
    const player = await createTestPlayer(sql)
    h.playerId = player.id
    const key = 'rival/avatars/rollback.webp'
    await sql`UPDATE players SET avatar_url = ${`${BASE}/${key}`} WHERE id = ${player.id}`
    // Trigger que aborta justo el UPDATE de anonimización, después de leer el avatar.
    const admin = adminSql()
    await admin`
      CREATE OR REPLACE FUNCTION tg_test_block_anon() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'anonymized' THEN RAISE EXCEPTION 'bloqueado por el test'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql
    `
    await admin`CREATE TRIGGER tg_test_block_anon BEFORE UPDATE ON players
                FOR EACH ROW EXECUTE FUNCTION tg_test_block_anon()`
    try {
      await expect(anonymizePlayer(player.id)).rejects.toMatchObject({
        cause: { message: expect.stringContaining('bloqueado por el test') },
      })
    } finally {
      await admin`DROP TRIGGER tg_test_block_anon ON players`
      await admin`DROP FUNCTION tg_test_block_anon()`
    }
    expect(h.deleteImage).not.toHaveBeenCalled()
    expect(await avatarOf(player.id)).toContain(key)
  })

  it.each([
    ['otro host', 'https://evil.example/rival/avatars/x.webp'],
    ['otro prefijo (cancha)', `${BASE}/11111111-1111-1111-1111-111111111111/courts/x.webp`],
  ])('avatar_url con %s: anonimiza pero no borra nada', async (_n, url) => {
    const player = await createTestPlayer(sql)
    await sql`UPDATE players SET avatar_url = ${url} WHERE id = ${player.id}`

    await anonymizePlayer(player.id)

    expect(h.deleteImage).not.toHaveBeenCalled()
    expect(await avatarOf(player.id)).toBeNull()
  })
})
