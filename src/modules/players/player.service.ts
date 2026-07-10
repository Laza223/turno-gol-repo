import { getWorkerSql } from '@/shared/db/client'
import { CURRENT_TERMS_VERSION } from '@/shared/terms'

export type GetOrCreatePlayerOpts = {
  agreedToTerms?: boolean
  termsVersion?: string
  phone?: string | null
}

/**
 * Idempotent provisioning by email (global `players` table). Runs before any
 * `player_id` is known (that's what it's resolving), so there is no
 * `app.current_player_id` to set — same shape as `getOrCreateStaffUser` in
 * auth.service.ts. `players` (006_rls_policies.sql) has NO INSERT policy at
 * all ("INSERT no tiene policy: solo service role") and its only UPDATE
 * policy is player-self-scoped; `036_force_rls_remaining_tables.sql` added
 * FORCE ROW LEVEL SECURITY on top. Under the restricted app pool (`turnogol_app`,
 * PR #30) this INSERT/UPDATE would violate RLS — needs the bypass-capable
 * worker pool, same as background jobs (CLAUDE.md: "Workers usan rol de
 * servicio separado").
 * On an existing player, backfills `agreed_to_terms_at`/`terms_version` if the
 * caller signals fresh consent and the row had none. Names are only used on insert.
 */
export async function getOrCreatePlayer(
  email: string,
  firstName: string,
  lastName: string,
  opts: GetOrCreatePlayerOpts = {},
): Promise<{ id: string }> {
  const sql = getWorkerSql()
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
