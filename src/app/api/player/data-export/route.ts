import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { withPlayer } from '@/server/middleware/with-player'
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
 *   - tenant_relationships: bookings/no-show counters + flags per complex
 *   - bans: any tenant_player_bans rows
 *   - consents: terms_version + agreed_at + +18 flag
 *   - rival (migr. 099): perfil RIVAL, partidos organizados (con SU WhatsApp
 *     guardado mientras exista), participaciones, denuncias hechas y suscripciones
 *     a alertas. Nunca el WhatsApp, el email ni el nombre de otra persona.
 *
 * Compliance traceability (ARCO Art. 22): audit_logs requires tenant_id NOT
 * NULL so cross-tenant exports are tracked via Sentry instead. A dedicated
 * player_data_exports table is planned for v1.5 if AAIP inspection requires it.
 */
export const GET = withPlayer(async (_req, user, tx) => {
  const profileRows = await tx.select().from(players).where(eq(players.id, user.playerId)).limit(1)

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
    ORDER BY date DESC, starts_at DESC
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

  // RIVAL (migr. 099). Todo filtrado por el jugador autenticado. `invite_code` queda
  // afuera (es una credencial del link, no un dato de la persona) y de las
  // denuncias solo se exporta si eran sobre una persona, no a quién: el id del
  // denunciado es dato de OTRO.
  const rivalOrganized = await adminSql<Record<string, unknown>[]>`
    SELECT m.id, m.tenant_id, m.booking_id, m.court_declared, m.starts_at, m.format,
           m.capacity, m.level, m.on_board, m.seeking, m.seeking_position, m.status,
           m.hidden_at, m.confirmed_count, m.filled_at, m.created_at,
           c.whatsapp_digits AS whatsapp_saved
    FROM rival_matches m
    LEFT JOIN rival_match_contacts c ON c.match_id = m.id
    WHERE m.organizer_player_id = ${user.playerId}
    ORDER BY m.starts_at DESC
  `

  const rivalParticipations = await adminSql<Record<string, unknown>[]>`
    SELECT id, match_id, tenant_id, role, status, origin, confirmed_at, decided_at, created_at
    FROM rival_participants
    WHERE player_id = ${user.playerId}
    ORDER BY created_at DESC
  `

  const rivalReports = await adminSql<Record<string, unknown>[]>`
    SELECT id, match_id, reason, (reported_player_id IS NOT NULL) AS about_a_person, created_at
    FROM rival_reports
    WHERE reporter_player_id = ${user.playerId}
    ORDER BY created_at DESC
  `

  const rivalAlertSubscriptions = await adminSql<Record<string, unknown>[]>`
    SELECT tenant_id, only_goalkeeper, created_at
    FROM rival_alert_subscriptions
    WHERE player_id = ${user.playerId}
  `

  const bundle = {
    exported_at: new Date().toISOString(),
    retention_policy: {
      bookings: '12 months',
      payments: '5 years (legal AFIP retention)',
      // 24 meses = decisión del dueño (D5, 2026-07-23), implementada en
      // purgeOldAuditLogs — mantener en sync con ese worker y doc18 §12.2.
      audit_logs: '24 months',
      // Mantener en sync con purgeOldRivalData (worker de retención).
      rival_matches:
        '12 months after the match; saved WhatsApp deleted when it starts or is canceled',
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
    rival: {
      profile: {
        position: profile.position,
        zone: profile.zone,
        avatar_url: profile.avatarUrl,
        accepted_at: profile.rivalAcceptedAt,
        terms_version: profile.rivalTermsVersion,
        signup_source: profile.signupSource,
      },
      organized_matches: rivalOrganized,
      participations: rivalParticipations,
      reports_made: rivalReports,
      alert_subscriptions: rivalAlertSubscriptions,
    },
  }

  // audit_logs.tenant_id is NOT NULL so we can't insert a tenant-less row.
  // Emit a Sentry message instead — captured in server logs for AAIP inspection.
  captureMessage('arco.data_exported', {
    level: 'info',
    extra: { player_id: user.playerId },
  })

  return NextResponse.json({ data: bundle })
})
