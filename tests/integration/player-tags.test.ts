/**
 * Integration test: etiquetas de cliente (B12 / D3, migr. 074).
 *
 * Cubre lo que el test unitario no puede: que la columna guarde de verdad, que
 * el CHECK de la base frene los repetidos aunque el service falle, que un
 * jugador de OTRO complejo no se pueda etiquetar desde acá, y que
 * `abonados.notes` ya no exista.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { setPlayerTags } from '@/modules/relationships/ptr.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

let tenantA: string
let tenantB: string
let playerA: string
let playerB: string

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)

  const a = await createTestTenant(sql)
  const b = await createTestTenant(sql)
  tenantA = a.id
  tenantB = b.id

  const pa = await createTestPlayer(sql)
  const pb = await createTestPlayer(sql)
  playerA = pa.id
  playerB = pb.id

  await linkPlayerToTenant(sql, tenantA, playerA)
  await linkPlayerToTenant(sql, tenantB, playerB)
}, 30_000)

afterAll(async () => {
  try {
    await closeSql()
  } catch {
    // best-effort cleanup
  }
})

const readTags = async (tenantId: string, playerId: string) => {
  const sql = getSql()
  const rows = await sql<{ tags: string[] }[]>`
    SELECT tags FROM player_tenant_relationships
     WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `
  return rows[0]?.tags ?? null
}

describe('setPlayerTags (B12)', () => {
  it('nace vacío, nunca NULL', async () => {
    expect(await readTags(tenantA, playerA)).toEqual([])
  })

  it('guarda el set y lo devuelve normalizado, con el valor previo para el audit log', async () => {
    const res = await withTenantContext(tenantA, (tx) =>
      setPlayerTags(tenantA, playerA, ['difficult', 'gets_credit'], tx),
    )
    expect(res).not.toBeNull()
    expect(res!.before).toEqual([])
    expect(res!.after).toEqual(['gets_credit', 'difficult'])
    expect(await readTags(tenantA, playerA)).toEqual(['gets_credit', 'difficult'])
  })

  it('reemplaza el set completo: lo que no viene, se va', async () => {
    const res = await withTenantContext(tenantA, (tx) =>
      setPlayerTags(tenantA, playerA, ['group_organizer'], tx),
    )
    expect(res!.before).toEqual(['gets_credit', 'difficult'])
    expect(res!.after).toEqual(['group_organizer'])
    expect(await readTags(tenantA, playerA)).toEqual(['group_organizer'])
  })

  it('sacar todas deja el array vacío', async () => {
    await withTenantContext(tenantA, (tx) => setPlayerTags(tenantA, playerA, [], tx))
    expect(await readTags(tenantA, playerA)).toEqual([])
  })

  it('deduplica antes de escribir (el CHECK de la base nunca llega a dispararse)', async () => {
    const res = await withTenantContext(tenantA, (tx) =>
      setPlayerTags(tenantA, playerA, ['no_credit', 'no_credit', 'difficult'], tx),
    )
    expect(res!.after).toEqual(['no_credit', 'difficult'])
  })

  // El service normaliza, pero la garantía de verdad es de la base: si mañana
  // alguien escribe un UPDATE crudo, el CHECK lo tiene que frenar igual.
  it('el CHECK de la base frena un UPDATE crudo con repetidos', async () => {
    const sql = getSql()
    await expect(
      sql`
        UPDATE player_tenant_relationships SET tags = '{difficult,difficult}'
         WHERE tenant_id = ${tenantA} AND player_id = ${playerA}
      `,
    ).rejects.toThrow(/chk_ptr_tags_unique/)
  })

  it('devuelve null para un jugador que no está vinculado a este complejo', async () => {
    const res = await withTenantContext(tenantA, (tx) =>
      setPlayerTags(tenantA, playerB, ['no_credit'], tx),
    )
    expect(res).toBeNull()
  })

  // La etiqueta es del complejo: que uno ponga "No fiar" no puede viajar al de
  // al lado. Por eso vive en player_tenant_relationships y no en players.
  it('etiquetar en un complejo no toca la ficha del mismo jugador en otro', async () => {
    await linkPlayerToTenant(getSql(), tenantB, playerA)
    await withTenantContext(tenantA, (tx) => setPlayerTags(tenantA, playerA, ['no_credit'], tx))

    expect(await readTags(tenantA, playerA)).toEqual(['no_credit'])
    expect(await readTags(tenantB, playerA)).toEqual([])
  })
})

describe('abonados.notes (D3)', () => {
  // La 075 dropeó la columna, en un release posterior al que dejó de usarla
  // (expand-contract; el motivo está en el encabezado de las dos migraciones).
  it('el código ya no la conoce: un INSERT desde Drizzle no la nombra', async () => {
    const { abonados } = await import('@/shared/db/schema')
    const cols = Object.keys(abonados)
    expect(cols).not.toContain('notes')
  })

  it('ya no existe en la DB: la 075 la dropeó', async () => {
    const sql = getSql()
    const rows = await sql<{ c: string }[]>`
      SELECT count(*) AS c FROM information_schema.columns
       WHERE table_name = 'abonados' AND column_name = 'notes'
    `
    expect(Number(rows[0]!.c)).toBe(0)
  })
})
