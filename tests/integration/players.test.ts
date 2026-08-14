import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { getOrCreatePlayer } from '@/modules/players/player.service'
import { cleanupAll, ensureRoles } from '../helpers/tenant'

beforeAll(async () => {
  await ensureRoles()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('getOrCreatePlayer', () => {
  it('creates a new player with terms agreed', async () => {
    const email = `p-${Date.now()}@test.local`
    const player = await getOrCreatePlayer(email, 'Tomás', 'Pérez', {
      agreedToTerms: true,
      termsVersion: 'v1',
    })
    expect(player.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(player.wasCreated).toBe(true)

    const sql = getSql()
    const rows = await sql<
      { email: string; agreed_to_terms_at: Date | null; terms_version: string | null }[]
    >`
      SELECT email, agreed_to_terms_at, terms_version FROM players WHERE id = ${player.id}
    `
    expect(rows[0]!.email).toBe(email.toLowerCase())
    expect(rows[0]!.agreed_to_terms_at).not.toBeNull()
    expect(rows[0]!.terms_version).toBe('v1')
  })

  it('is idempotent by email and backfills terms', async () => {
    const email = `p2-${Date.now()}@test.local`
    const sql = getSql()
    await sql`INSERT INTO players (email, first_name, last_name) VALUES (${email}, 'X', '')`
    const player = await getOrCreatePlayer(email, 'Ignored', 'Ignored', {
      agreedToTerms: true,
      termsVersion: 'v1',
    })
    expect(player.wasCreated).toBe(false)
    const rows = await sql<{ id: string }[]>`SELECT id FROM players WHERE email = ${email}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(player.id)

    const terms = await sql<{ agreed_to_terms_at: Date | null }[]>`
      SELECT agreed_to_terms_at FROM players WHERE id = ${player.id}
    `
    expect(terms[0]!.agreed_to_terms_at).not.toBeNull()
  })
})
