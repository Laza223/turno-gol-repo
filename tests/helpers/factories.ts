import { faker } from '@faker-js/faker'
import type { Sql } from 'postgres'
import { artDateOf } from '@/shared/time/art-date'

const dayMs = 86400000

export async function getOrCreatePlanId(sql: Sql): Promise<string> {
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM plans WHERE slug = 'predio' LIMIT 1
  `
  if (existing.length) return existing[0].id
  const rows = await sql<{ id: string }[]>`
    INSERT INTO plans (name, slug, max_courts, price_monthly, price_annual, is_active)
    VALUES ('Predio', ${'predio-test-' + faker.string.alphanumeric(6)}, 2, 5500000, 4400000, true)
    RETURNING id
  `
  return rows[0].id
}

export async function insertCourt(sql: Sql, tenantId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity)
    VALUES (${tenantId}, ${faker.commerce.productName().slice(0, 30)}, 10)
    RETURNING id
  `
  return rows[0].id
}

/**
 * Abonado de relleno para los seeds (RLS, retención de datos): lo único que se
 * le pide es existir y tener id.
 *
 * El día y el horario son DETERMINISTAS y viven fuera de la franja 20:00–21:00
 * a propósito. Antes el día salía de `faker.number.int({ min: 0, max: 6 })` sobre
 * la MISMA cancha que devuelve `seedIsolationData`, así que 1 de cada 7 corridas
 * caía en lunes y chocaba con el abonado que crea
 * `tests/integration/race-abonado-vs-individual.test.ts` (lunes 20:00–21:00) —
 * `createAbonado` tiraba AbonadoConflictError y el test fallaba de forma
 * intermitente sin ninguna relación con lo que estaba probando.
 */
export async function insertAbonado(
  sql: Sql,
  tenantId: string,
  courtId: string,
  dayOfWeek = 3,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO abonados (
      tenant_id, court_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session, starts_on
    )
    VALUES (
      ${tenantId}, ${courtId}, ${faker.person.fullName()}, ${faker.phone.number()},
      ${dayOfWeek}, '08:00', '09:00',
      ${1500000}, ${new Date().toISOString().slice(0, 10)}
    )
    RETURNING id
  `
  return rows[0].id
}

// ─── Torneos (migr. 062) ──────────────────────────────────────────────

export async function insertTournament(
  sql: Sql,
  tenantId: string,
  overrides: { name?: string; slug?: string; format?: string } = {},
): Promise<string> {
  // El slug es único por complejo: randomizarlo evita choques entre tests.
  const slug = overrides.slug ?? `torneo-${faker.string.alphanumeric(8).toLowerCase()}`
  const rows = await sql<{ id: string }[]>`
    INSERT INTO tournaments (tenant_id, name, slug, format, starts_on)
    VALUES (
      ${tenantId},
      ${overrides.name ?? `Torneo ${faker.word.noun()}`},
      ${slug},
      ${overrides.format ?? 'league'}::tournament_format,
      ${new Date().toISOString().slice(0, 10)}
    )
    RETURNING id
  `
  return rows[0].id
}

export async function insertTournamentTeam(
  sql: Sql,
  args: { tenantId: string; tournamentId: string; name?: string },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO tournament_teams (tenant_id, tournament_id, name)
    VALUES (
      ${args.tenantId}, ${args.tournamentId},
      ${args.name ?? `${faker.word.adjective()} ${faker.string.alphanumeric(6)}`}
    )
    RETURNING id
  `
  return rows[0].id
}

export async function insertTournamentTeamPlayer(
  sql: Sql,
  args: { tenantId: string; teamId: string; fullName?: string },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO tournament_team_players (tenant_id, team_id, full_name)
    VALUES (${args.tenantId}, ${args.teamId}, ${args.fullName ?? faker.person.fullName()})
    RETURNING id
  `
  return rows[0].id
}

export async function insertBooking(
  sql: Sql,
  opts: {
    tenantId: string
    courtId: string
    playerId?: string | null
    date?: string
    timeStart?: string
    timeEnd?: string
    status?: string
    depositStatus?: string
    depositAmount?: number
  },
): Promise<string> {
  const date = opts.date ?? new Date(Date.now() + 7 * dayMs).toISOString().slice(0, 10)
  const timeStart = opts.timeStart ?? '14:00'
  const timeEnd = opts.timeEnd ?? '15:00'
  const depositStatus = opts.depositStatus ?? 'not_required'
  const depositAmount = opts.depositAmount ?? 0
  // chk_booking_payment_consistency: payment_method NULL is valid for
  //   deposit_status='not_required' OR (migration 009) 'pending'.
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method
      ${opts.status ? sql`, status` : sql``}
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId ?? null},
      ${date}, ${timeStart}, ${timeEnd},
      (${date}::date + ${timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${date}::date + ${timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${800000}, ${depositAmount}, ${depositStatus}, NULL
      ${opts.status ? sql`, ${opts.status}::booking_status` : sql``}
    )
    RETURNING id
  `
  return rows[0].id
}

export async function insertPayment(
  sql: Sql,
  opts: { tenantId: string; bookingId?: string | null; playerId?: string | null },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO payments (tenant_id, booking_id, player_id, amount, type, method, status)
    VALUES (
      ${opts.tenantId}, ${opts.bookingId ?? null}, ${opts.playerId ?? null},
      ${500000}, 'full_payment', 'cash', 'approved'
    )
    RETURNING id
  `
  return rows[0].id
}

export async function insertCashFlow(
  sql: Sql,
  opts: { tenantId: string; registeredBy: string; bookingId?: string | null },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO cash_flows (
      tenant_id, type, category, amount, method, description,
      booking_id, registered_by, occurred_at
    )
    VALUES (
      ${opts.tenantId}, 'income', 'booking', ${500000}, 'cash',
      ${'Cobro turno'}, ${opts.bookingId ?? null}, ${opts.registeredBy}, NOW()
    )
    RETURNING id
  `
  return rows[0].id
}

export async function insertDailyCashClose(
  sql: Sql,
  opts: { tenantId: string; closedBy: string; date?: string },
): Promise<string> {
  // Día operativo ART pasado (no "hoy"): un cierre de caja sembrado nunca debe
  // colisionar con los cash_flows que los tests crean "hoy" (p. ej. la seña MP
  // confirmada en race-double-payment). Antes usaba fecha UTC de hoy → chocaba
  // con assertDayOpen (que usa artDateOf) ~21 de 24 horas del día. Ver ENS-21.
  const date = opts.date ?? artDateOf(new Date(Date.now() - 7 * dayMs))
  const rows = await sql<{ id: string }[]>`
    INSERT INTO daily_cash_closes (
      tenant_id, date, total_income, total_adjustments, balance,
      declared_cash, diff_amount, closed_by
    )
    VALUES (
      ${opts.tenantId}, ${date}, ${500000}, ${0}, ${500000},
      ${500000}, ${0}, ${opts.closedBy}
    )
    RETURNING id
  `
  return rows[0].id
}

export async function insertSubscription(
  sql: Sql,
  opts: { tenantId: string; planId: string },
): Promise<string> {
  const start = new Date()
  const end = new Date(start.getTime() + 30 * dayMs)
  const rows = await sql<{ id: string }[]>`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, current_period_start, current_period_end
    )
    VALUES (${opts.tenantId}, ${opts.planId}, ${start.toISOString()}, ${end.toISOString()})
    RETURNING id
  `
  return rows[0].id
}

export async function insertBan(
  sql: Sql,
  opts: { tenantId: string; playerId: string; bannedBy?: string | null },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_by)
    VALUES (${opts.tenantId}, ${opts.playerId}, ${'no-show repetido'}, ${opts.bannedBy ?? null})
    RETURNING id
  `
  return rows[0].id
}

export async function insertNotification(
  sql: Sql,
  opts: {
    tenantId: string
    recipientType: 'player' | 'staff' | 'tenant_owner'
    recipientId: string
  },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO notifications (
      tenant_id, recipient_type, recipient_id, channel, trigger_event, content
    )
    VALUES (
      ${opts.tenantId}, ${opts.recipientType}, ${opts.recipientId},
      'email', ${'booking.confirmed'}, ${sql.json({ subject: 'test' })}
    )
    RETURNING id
  `
  return rows[0].id
}

export async function insertAuditLog(
  sql: Sql,
  opts: {
    tenantId: string
    actorId: string
    actorType: 'staff' | 'player' | 'system'
    resourceId: string
  },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO audit_logs (
      tenant_id, actor_id, actor_type, action, resource_type, resource_id
    )
    VALUES (
      ${opts.tenantId}, ${opts.actorId}, ${opts.actorType},
      ${'booking.create'}, ${'booking'}, ${opts.resourceId}
    )
    RETURNING id
  `
  return rows[0].id
}
