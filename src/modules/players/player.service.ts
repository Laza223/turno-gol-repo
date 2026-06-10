import { getSql } from '@/shared/db/client'
import { CURRENT_TERMS_VERSION } from '@/shared/terms'

export type GetOrCreatePlayerOpts = {
  agreedToTerms?: boolean
  termsVersion?: string
  phone?: string | null
}

/**
 * Idempotent provisioning by email (global `players` table, no RLS).
 * On an existing player, backfills `agreed_to_terms_at`/`terms_version` if the
 * caller signals fresh consent and the row had none. Names are only used on insert.
 */
export async function getOrCreatePlayer(
  email: string,
  firstName: string,
  lastName: string,
  opts: GetOrCreatePlayerOpts = {},
): Promise<{ id: string }> {
  const sql = getSql()
  const lower = email.toLowerCase()
  const agreed = opts.agreedToTerms === true
  const termsVersion = opts.termsVersion ?? CURRENT_TERMS_VERSION

  const existing = await sql<{ id: string; agreed_to_terms_at: Date | null }[]>`
    SELECT id, agreed_to_terms_at FROM players WHERE email = ${lower} LIMIT 1
  `
  if (existing.length > 0) {
    const row = existing[0]!
    if (agreed && row.agreed_to_terms_at === null) {
      await sql`
        UPDATE players
        SET agreed_to_terms_at = NOW(), terms_version = ${termsVersion}, last_login_at = NOW()
        WHERE id = ${row.id}
      `
    } else {
      await sql`UPDATE players SET last_login_at = NOW() WHERE id = ${row.id}`
    }
    return { id: row.id }
  }

  const created = await sql<{ id: string }[]>`
    INSERT INTO players (email, first_name, last_name, phone, agreed_to_terms_at, terms_version, last_login_at)
    VALUES (
      ${lower}, ${firstName}, ${lastName}, ${opts.phone ?? null},
      ${agreed ? sql`NOW()` : null}, ${agreed ? termsVersion : null}, NOW()
    )
    ON CONFLICT (email) DO UPDATE
    SET last_login_at = NOW(),
        agreed_to_terms_at = COALESCE(players.agreed_to_terms_at, EXCLUDED.agreed_to_terms_at),
        terms_version = COALESCE(players.terms_version, EXCLUDED.terms_version)
    RETURNING id
  `
  return { id: created[0]!.id }
}
