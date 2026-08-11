import { getSql } from '@/shared/db/client'
import {
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  linkPlayerToTenant,
  linkStaffToTenant,
} from './tenant'
import {
  insertBooking,
  insertCashFlow,
  insertCourt,
  insertNotification,
  insertPayment,
  insertAuditLog,
  insertAbonado,
  insertBan,
  insertDailyCashClose,
  insertSubscription,
  getOrCreatePlanId,
  insertTournament,
  insertTournamentTeam,
  insertTournamentTeamPlayer,
  insertTournamentStage,
  insertTournamentMatch,
  insertTournamentMatchEvent,
} from './factories'

/**
 * Seed compartido por los tests del worker de retención
 * (`data-retention-cleanup.test.ts` y `data-retention-worker-role.test.ts`).
 * Extraído del primero cuando el segundo (rol real, sin superusuario) empezó a
 * necesitar exactamente el mismo grafo.
 */

export type TenantBundle = {
  tenantId: string
  playerId: string
  staffId: string
  bookingId: string
}

/**
 * Creates a tenant with one row in every isolated child table plus a full set
 * of PII / MP-credential fields populated (so anonymization asserts something
 * real: NULL→NULL would prove nothing).
 *
 * The booking ends up TERMINAL (`completed`) with the circular FK actually
 * populated (`bookings.payment_id` → payments → `payments.booking_id`): the
 * wipe must delete terminal bookings and both halves of the cycle without
 * `session_replication_role` (migr. 058 defers `fk_bookings_payment`
 * instead) — a seed without the cycle would let a broken wipe pass.
 *
 * - `scheduleDaysAgo`: number → `scheduled_deletion_at = NOW() - INTERVAL n days`
 *   (negative ⇒ future). `null`/omitted ⇒ leave NULL (not a deletion target).
 * - `status`: tenant_status to force. Defaults to `'churned'` when a past
 *   deletion is scheduled, otherwise the table default (`'trialing'`).
 */
export async function setupTenant(
  opts: {
    scheduleDaysAgo?: number | null
    status?: string
    mpSubscriptionId?: string
  } = {},
): Promise<TenantBundle> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const staff = await createTestStaffUser(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  await linkStaffToTenant(sql, tenant.id, staff.id)

  const courtId = await insertCourt(sql, tenant.id)
  const bookingId = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId,
    playerId: player.id,
  })
  const paymentId = await insertPayment(sql, {
    tenantId: tenant.id,
    bookingId,
    playerId: player.id,
  })
  // Cerrar el ciclo bookings ↔ payments Y volver el booking terminal en el
  // MISMO UPDATE: una vez `completed`, enforce_booking_invariants bloquea
  // cualquier UPDATE posterior. payment_method='mercadopago' acompaña por
  // chk_booking_payment_consistency (mercadopago ⇔ payment_id NOT NULL).
  await sql`
    UPDATE bookings
    SET payment_id = ${paymentId},
        payment_method = 'mercadopago',
        status = 'completed'::booking_status
    WHERE id = ${bookingId}
  `
  await insertCashFlow(sql, { tenantId: tenant.id, registeredBy: staff.id, bookingId })
  await insertNotification(sql, {
    tenantId: tenant.id,
    recipientType: 'player',
    recipientId: player.id,
  })
  await insertAuditLog(sql, {
    tenantId: tenant.id,
    actorId: staff.id,
    actorType: 'staff',
    resourceId: bookingId,
  })
  await insertAbonado(sql, tenant.id, courtId)
  await insertBan(sql, { tenantId: tenant.id, playerId: player.id, bannedBy: staff.id })
  await insertDailyCashClose(sql, { tenantId: tenant.id, closedBy: staff.id })
  const planId = await getOrCreatePlanId(sql)
  await insertSubscription(sql, { tenantId: tenant.id, planId })
  if (opts.mpSubscriptionId) {
    await sql`
      UPDATE tenant_subscriptions
      SET mp_subscription_id = ${opts.mpSubscriptionId}
      WHERE tenant_id = ${tenant.id}
    `
  }

  // Torneos (migr. 062/064/065). La cadena entera, para que el wipe se ejercite
  // de verdad: sin estas filas las 6 tablas contaban 0 antes y 0 después, así
  // que su DELETE nunca se verificaba.
  const tournamentId = await insertTournament(sql, tenant.id)
  const tournamentTeamId = await insertTournamentTeam(sql, {
    tenantId: tenant.id,
    tournamentId,
  })
  const tournamentTeamPlayerId = await insertTournamentTeamPlayer(sql, {
    tenantId: tenant.id,
    teamId: tournamentTeamId,
  })
  const tournamentStageId = await insertTournamentStage(sql, {
    tenantId: tenant.id,
    tournamentId,
  })
  const tournamentMatchId = await insertTournamentMatch(sql, {
    tenantId: tenant.id,
    tournamentId,
    stageId: tournamentStageId,
    homeTeamId: tournamentTeamId,
  })
  await insertTournamentMatchEvent(sql, {
    tenantId: tenant.id,
    tournamentId,
    matchId: tournamentMatchId,
    teamId: tournamentTeamId,
    teamPlayerId: tournamentTeamPlayerId,
  })
  // Migr. 066: un cobro de inscripción, que es cash_flows → tournament_teams.
  // Es lo que obliga al wipe a borrar cash_flows ANTES que los equipos; sin
  // esta fila el orden nunca se ejercita y una inversión pasaría en verde.
  await insertCashFlow(sql, {
    tenantId: tenant.id,
    registeredBy: staff.id,
    tournamentTeamId,
  })

  // Hybrid / operational tenant-scoped rows the wipe must also clear.
  // reviews.booking_id is a RESTRICT FK to bookings: the wipe deletes reviews
  // before bookings or the bookings DELETE fails the FK check.
  await sql`
    INSERT INTO reviews (tenant_id, player_id, booking_id, rating, comment)
    VALUES (${tenant.id}, ${player.id}, ${bookingId}, ${5}, ${'buena cancha'})
  `
  await sql`
    INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
    VALUES (${tenant.id}, ${staff.id}, ${'https://push.example/' + tenant.id}, ${'p256'}, ${'auth'})
  `
  await sql`
    INSERT INTO player_favorites (player_id, tenant_id)
    VALUES (${player.id}, ${tenant.id})
  `
  await sql`
    INSERT INTO feature_flags (key, value, tenant_id)
    VALUES (${'kill_switch'}, ${true}, ${tenant.id})
  `

  // Seed every anonymizable PII / MP-credential field with a non-null value so
  // the worker's UPDATE has something to actually scrub.
  //
  // `mp_user_id` va derivado del id del complejo, no fijo: una cuenta de
  // MercadoPago cobra para UN solo complejo (índice `uq_tenants_mp_user_id`,
  // migr. 069) y este helper se llama varias veces por test. Con un valor
  // constante, el segundo complejo choca con el primero.
  await sql`
    UPDATE tenants
    SET mp_access_token = ${'enc-token'},
        mp_refresh_token = ${'enc-refresh'},
        mp_user_id = ${`mp-user-${tenant.id}`},
        mp_public_key = ${'mp-pub-key'},
        description = ${'Complejo de prueba'},
        logo_url = ${'https://cdn.example/logo.png'},
        cover_url = ${'https://cdn.example/cover.png'},
        whatsapp = ${'+5491122223333'},
        latitude = ${-34.6},
        longitude = ${-58.4}
    WHERE id = ${tenant.id}
  `

  if (opts.scheduleDaysAgo !== null && opts.scheduleDaysAgo !== undefined) {
    const status = opts.status ?? 'churned'
    await sql`
      UPDATE tenants
      SET scheduled_deletion_at = NOW() - INTERVAL '${sql.unsafe(String(opts.scheduleDaysAgo))} days',
          status = ${status}::tenant_status
      WHERE id = ${tenant.id}
    `
  } else if (opts.status) {
    await sql`
      UPDATE tenants SET status = ${opts.status}::tenant_status WHERE id = ${tenant.id}
    `
  }

  return { tenantId: tenant.id, playerId: player.id, staffId: staff.id, bookingId }
}

export type ChildCounts = {
  bookings: number
  payments: number
  cashFlows: number
  notifications: number
  auditLogs: number
  abonados: number
  bans: number
  closes: number
  courts: number
  staffMembers: number
  playerRels: number
  subscriptions: number
  reviews: number
  pushSubs: number
  favorites: number
  flags: number
  // Torneos (migr. 062/064/065). Faltaban desde la fase 1: como el test compara
  // objetos completos, las tablas ausentes simplemente no se verificaban.
  tournaments: number
  tournamentTeams: number
  tournamentTeamPlayers: number
  tournamentStages: number
  tournamentMatches: number
  tournamentMatchEvents: number
}

export async function countChildren(
  sql: ReturnType<typeof getSql>,
  tenantId: string,
): Promise<ChildCounts> {
  const [r] = await sql<Array<Record<keyof ChildCounts, string>>>`
    SELECT
      (SELECT COUNT(*) FROM bookings WHERE tenant_id = ${tenantId})::text AS bookings,
      (SELECT COUNT(*) FROM payments WHERE tenant_id = ${tenantId})::text AS payments,
      (SELECT COUNT(*) FROM cash_flows WHERE tenant_id = ${tenantId})::text AS "cashFlows",
      (SELECT COUNT(*) FROM notifications WHERE tenant_id = ${tenantId})::text AS notifications,
      (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = ${tenantId})::text AS "auditLogs",
      (SELECT COUNT(*) FROM abonados WHERE tenant_id = ${tenantId})::text AS abonados,
      (SELECT COUNT(*) FROM tenant_player_bans WHERE tenant_id = ${tenantId})::text AS bans,
      (SELECT COUNT(*) FROM daily_cash_closes WHERE tenant_id = ${tenantId})::text AS closes,
      (SELECT COUNT(*) FROM courts WHERE tenant_id = ${tenantId})::text AS courts,
      (SELECT COUNT(*) FROM tenant_staff_members WHERE tenant_id = ${tenantId})::text AS "staffMembers",
      (SELECT COUNT(*) FROM player_tenant_relationships WHERE tenant_id = ${tenantId})::text AS "playerRels",
      (SELECT COUNT(*) FROM tenant_subscriptions WHERE tenant_id = ${tenantId})::text AS subscriptions,
      (SELECT COUNT(*) FROM reviews WHERE tenant_id = ${tenantId})::text AS reviews,
      (SELECT COUNT(*) FROM push_subscriptions WHERE tenant_id = ${tenantId})::text AS "pushSubs",
      (SELECT COUNT(*) FROM player_favorites WHERE tenant_id = ${tenantId})::text AS favorites,
      (SELECT COUNT(*) FROM feature_flags WHERE tenant_id = ${tenantId})::text AS flags,
      (SELECT COUNT(*) FROM tournaments WHERE tenant_id = ${tenantId})::text AS tournaments,
      (SELECT COUNT(*) FROM tournament_teams WHERE tenant_id = ${tenantId})::text AS "tournamentTeams",
      (SELECT COUNT(*) FROM tournament_team_players WHERE tenant_id = ${tenantId})::text AS "tournamentTeamPlayers",
      (SELECT COUNT(*) FROM tournament_stages WHERE tenant_id = ${tenantId})::text AS "tournamentStages",
      (SELECT COUNT(*) FROM tournament_matches WHERE tenant_id = ${tenantId})::text AS "tournamentMatches",
      (SELECT COUNT(*) FROM tournament_match_events WHERE tenant_id = ${tenantId})::text AS "tournamentMatchEvents"
  `
  return {
    bookings: Number(r.bookings),
    payments: Number(r.payments),
    cashFlows: Number(r.cashFlows),
    notifications: Number(r.notifications),
    auditLogs: Number(r.auditLogs),
    abonados: Number(r.abonados),
    bans: Number(r.bans),
    closes: Number(r.closes),
    courts: Number(r.courts),
    staffMembers: Number(r.staffMembers),
    playerRels: Number(r.playerRels),
    subscriptions: Number(r.subscriptions),
    reviews: Number(r.reviews),
    pushSubs: Number(r.pushSubs),
    favorites: Number(r.favorites),
    flags: Number(r.flags),
    tournaments: Number(r.tournaments),
    tournamentTeams: Number(r.tournamentTeams),
    tournamentTeamPlayers: Number(r.tournamentTeamPlayers),
    tournamentStages: Number(r.tournamentStages),
    tournamentMatches: Number(r.tournamentMatches),
    tournamentMatchEvents: Number(r.tournamentMatchEvents),
  }
}

export const ZERO: ChildCounts = {
  bookings: 0,
  payments: 0,
  cashFlows: 0,
  notifications: 0,
  auditLogs: 0,
  abonados: 0,
  bans: 0,
  closes: 0,
  courts: 0,
  staffMembers: 0,
  playerRels: 0,
  subscriptions: 0,
  reviews: 0,
  pushSubs: 0,
  favorites: 0,
  flags: 0,
  tournaments: 0,
  tournamentTeams: 0,
  tournamentTeamPlayers: 0,
  tournamentStages: 0,
  tournamentMatches: 0,
  tournamentMatchEvents: 0,
}

export const FULL: ChildCounts = {
  bookings: 1,
  payments: 1,
  // Dos: el cobro del turno y el de la inscripción del torneo (migr. 066).
  cashFlows: 2,
  notifications: 1,
  auditLogs: 1,
  abonados: 1,
  bans: 1,
  closes: 1,
  courts: 1,
  staffMembers: 1,
  playerRels: 1,
  subscriptions: 1,
  reviews: 1,
  pushSubs: 1,
  favorites: 1,
  flags: 1,
  tournaments: 1,
  tournamentTeams: 1,
  tournamentTeamPlayers: 1,
  tournamentStages: 1,
  tournamentMatches: 1,
  tournamentMatchEvents: 1,
}
