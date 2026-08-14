import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { getOrCreatePlayer, acceptPlayerTerms } from '@/modules/players/player.service'
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
    expect(player.hasAgreedTerms).toBe(true)

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
    expect(player.hasAgreedTerms).toBe(true)
    const rows = await sql<{ id: string }[]>`SELECT id FROM players WHERE email = ${email}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(player.id)

    const terms = await sql<{ agreed_to_terms_at: Date | null }[]>`
      SELECT agreed_to_terms_at FROM players WHERE id = ${player.id}
    `
    expect(terms[0]!.agreed_to_terms_at).not.toBeNull()
  })

  it('alta nueva sin consentimiento (Google vía /ingresar) -> hasAgreedTerms false', async () => {
    const email = `p3-${Date.now()}@test.local`
    const player = await getOrCreatePlayer(email, 'Nuevo', 'Jugador', { agreedToTerms: false })
    expect(player.wasCreated).toBe(true)
    expect(player.hasAgreedTerms).toBe(false)

    const sql = getSql()
    const rows = await sql<{ agreed_to_terms_at: Date | null }[]>`
      SELECT agreed_to_terms_at FROM players WHERE id = ${player.id}
    `
    expect(rows[0]!.agreed_to_terms_at).toBeNull()
  })

  it(
    'dedup por email: magic link (agreed) y Google (sin agreed) para el mismo email ' +
      'resuelven a UNA fila con el consentimiento preservado',
    async () => {
      const email = `p-dedup-${Date.now()}@test.local`
      const viaMagicLink = await getOrCreatePlayer(email, 'Tomás', 'Pérez', {
        agreedToTerms: true,
        termsVersion: 'v1',
      })
      expect(viaMagicLink.wasCreated).toBe(true)
      expect(viaMagicLink.hasAgreedTerms).toBe(true)

      // Mismo email, "otra" identidad de auth (Google) sin agreed — simula el
      // jugador que ya se registró por magic link y vuelve a entrar con Google.
      const viaGoogle = await getOrCreatePlayer(email, 'Ignorado', 'Ignorado', {
        agreedToTerms: false,
      })
      expect(viaGoogle.wasCreated).toBe(false)
      expect(viaGoogle.id).toBe(viaMagicLink.id)
      expect(viaGoogle.hasAgreedTerms).toBe(true) // preservado, no se pisa

      const sql = getSql()
      const rows = await sql<{ id: string }[]>`SELECT id FROM players WHERE email = ${email}`
      expect(rows).toHaveLength(1)
    },
  )
})

describe('acceptPlayerTerms', () => {
  it('setea agreed_to_terms_at/terms_version bajo RLS self-scoped', async () => {
    const email = `p-accept-${Date.now()}@test.local`
    const player = await getOrCreatePlayer(email, 'Sin', 'Consentir', { agreedToTerms: false })
    expect(player.hasAgreedTerms).toBe(false)

    await acceptPlayerTerms(player.id, 'v3')

    const sql = getSql()
    const rows = await sql<{ agreed_to_terms_at: Date | null; terms_version: string | null }[]>`
      SELECT agreed_to_terms_at, terms_version FROM players WHERE id = ${player.id}
    `
    expect(rows[0]!.agreed_to_terms_at).not.toBeNull()
    expect(rows[0]!.terms_version).toBe('v3')
  })
})
