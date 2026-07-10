import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { withPlayer } from '@/shared/middleware/with-player'
import { notFound } from '@/shared/api-error'
import { getWorkerSql } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { captureMessage } from '@/lib/sentry'

export const dynamic = 'force-dynamic'

/**
 * ARCO Acceso (Ley 25.326 Art. 14): right of access — full dataset export.
 *
 * Returns the authenticated player's personal data plus aggregated history.
 * Single-shot JSON response (no pagination by design — total data per player
 * is bounded by the 12-month retention window).
 *
 * Contents (per doc18 §5.1):
 *   - profile: players.* (excluding system internals)
 *   - bookings: last 12 months (booking_id, court_id, dates, status)
 *   - payments: last 5 years (payment_id, type, status, amount, dates)
 *   - tenant_relationships: balance + flags per complex
 *   - bans: any tenant_player_bans rows
 *   - consents: terms_version + agreed_at + +18 flag
 *
 * Compliance traceability (ARCO Art. 22): audit_logs requires tenant_id NOT
 * NULL so cross-tenant exports are tracked via Sentry instead. A dedicated
 * player_data_exports table is planned for v1.5 if AAIP inspection requires it.
 */
export const GET = withPlayer(async (_req, user, tx) => {
  const profileRows = await tx
    .select()
    .from(players)
    .where(eq(players.id, user.playerId))
    .limit(1)

  if (!profileRows[0]) {
    return notFound('Player no encontrado.')
  }
  const profile = profileRows[0]

  // Compliance dump queries via the worker/service pool (RLS bypassed —
  // caza-bugs #8: getSql() is the RESTRICTED turnogol_app role and returned 0
  // rows here since these queries run outside withTenantContext/withPlayerContext,
  // so no SET LOCAL app.current_* was ever set for RLS to key off) — necessary
  // because:
  //   - payments / tenant_player_bans / cash_flows have tenant-scoped RLS but
  //     no player-scoped policy. A player has cross-tenant scope by design.
  //   - All queries are STRICTLY filtered by `player_id = ${user.playerId}`,
  //     where user.playerId comes from a Supabase-verified JWT.
  // This is the ARCO Art. 14 access right; the player can only see their own
  // data regardless of which tenant produced it.
  const adminSql = getWorkerSql()

  const bookings = await adminSql<Record<string, unknown>[]>`
    SELECT
      id, tenant_id, court_id, date, time_start, time_end,
      type, status, price_snapshot, deposit_amount, deposit_status,
      created_at, updated_at, canceled_at, canceled_reason
    FROM bookings
    WHERE player_id = ${user.playerId}
      AND created_at >= NOW() - INTERVAL '12 months'
    ORDER BY date DESC, time_start DESC
  `

  const payments = await adminSql<Record<string, unknown>[]>`
    SELECT
      id, tenant_id, booking_id, amount, currency, type, method, status,
      mp_payment_id, processed_at, created_at
    FROM payments
    WHERE player_id = ${user.playerId}
      AND created_at >= NOW() - INTERVAL '5 years'
    ORDER BY created_at DESC
  `

  const tenantRelationships = await adminSql<Record<string, unknown>[]>`
    SELECT tenant_id, bookings_count, noshow_count, last_booking_at,
           first_seen_at, status, data_consent_at
    FROM player_tenant_relationships
    WHERE player_id = ${user.playerId}
  `

  const bans = await adminSql<Record<string, unknown>[]>`
    SELECT tenant_id, reason, banned_at
    FROM tenant_player_bans
    WHERE player_id = ${user.playerId}
  `

  const bundle = {
    exported_at: new Date().toISOString(),
    retention_policy: {
      bookings: '12 months',
      payments: '5 years (legal AFIP retention)',
      audit_logs: '12 months',
    },
    profile: {
      id: profile.id,
      email: profile.email,
      first_name: profile.firstName,
      last_name: profile.lastName,
      phone: profile.phone,
      preferred_area: profile.preferredArea,
      status: profile.status,
      avatar_url: profile.avatarUrl,
      agreed_to_terms_at: profile.agreedToTermsAt,
      terms_version: profile.termsVersion,
      created_at: profile.createdAt,
      last_login_at: profile.lastLoginAt,
    },
    consents: {
      terms_accepted: profile.agreedToTermsAt !== null,
      terms_version: profile.termsVersion,
      terms_accepted_at: profile.agreedToTermsAt,
      over_18_declaration: profile.agreedToTermsAt !== null, // ADR-012
    },
    bookings,
    payments,
    tenant_relationships: tenantRelationships,
    bans,
  }

  // audit_logs.tenant_id is NOT NULL so we can't insert a tenant-less row.
  // Emit a Sentry message instead — captured in server logs for AAIP inspection.
  captureMessage('arco.data_exported', {
    level: 'info',
    extra: { player_id: user.playerId },
  })

  return NextResponse.json({ data: bundle })
})
