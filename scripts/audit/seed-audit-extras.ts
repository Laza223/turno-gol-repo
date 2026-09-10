import { config } from 'dotenv'
// Standalone: mismo patrón que scripts/demo/seed-demo-tenant.ts y scripts/seed-e2e.ts.
config({ path: '.env.local' })

import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { formatInTimeZone } from 'date-fns-tz'
import { and, asc, eq, sql as drizzleSql } from 'drizzle-orm'
import { canteenProducts } from '@/shared/db/schema'
import { withTenantContext, closeSql, type DbTx } from '@/shared/db/client'
import { banPlayerManually, resolveManualBanUntil } from '@/modules/bans/ban.service'
import { handleNoShow } from '@/modules/bookings/booking.cancellation'
import { prepareManualRefund } from '@/modules/payments/refund.service'
import { setPlayerTags } from '@/modules/relationships/ptr.service'
import type { PlayerTag } from '@/modules/relationships/player-tags'
import { toggleStatus } from '@/modules/courts/court.service'
import { createTournament } from '@/modules/tournaments/tournament.service'
import { addTeam, addTeamPlayer } from '@/modules/tournaments/tournament-team.service'
import { reserveTournamentSlots } from '@/modules/tournaments/tournament-slots.service'
import { generateFixture } from '@/modules/tournaments/tournament-fixture.service'
import { saveMatchResult, addMatchEvent } from '@/modules/tournaments/tournament-result.service'
import { createTab } from '@/modules/canteen/canteen-tab.service'
import { E2E_TEST_PASSWORD } from '../../tests/e2e/_helpers/test-credentials'
import { bookingInstants } from '../../tests/e2e/_helpers/booking-instants'

/**
 * Capa ADITIVA sobre el tenant demo (`scripts/demo/seed-demo-tenant.ts`): agrega
 * un manager, prende Torneos SOLO para este tenant y siembra los 9 "estados
 * sucios a propósito" del informe de auditoría (scratchpad/seed-corpus.md) para
 * que ninguna pantalla del panel salga vacía en una foto.
 *
 * Separado de seed-demo-tenant.ts a propósito: ese seed lo usa el dueño para
 * grabar videos de producto — ensuciarlo con deudas y bloqueos arruinaría el
 * material comercial. Este script corre DESPUÉS, es opcional, e idempotente.
 *
 * Los ids/valores del tenant demo están COPIADOS de scripts/demo/seed-demo-tenant.ts
 * (DEMO ahí no se exporta, mismo patrón que seed-e2e.ts define los suyos propios)
 * — si esos cambian, actualizar acá también.
 */
const SEED_ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
const ART_TZ = 'America/Argentina/Buenos_Aires'

const DEMO = {
  tenantId: 'd0000000-0000-4000-8000-000000000001',
  tenantSlug: 'la-redonda',
  adminEmail: 'demo-admin@turnogol.test',
  staffUserId: 'd0000000-0000-4000-8000-000000000003',
  playerId: 'd0000000-0000-4000-8000-000000000020',
  courtIds: [
    'd0000000-0000-4000-8000-000000000010',
    'd0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000012',
    'd0000000-0000-4000-8000-000000000013',
  ],
}

// Namespace propio (prefijo `a1`) para no pisar los ids `d0…` del seed base ni
// los `00…` de e2e. Fijos a propósito: los usa el cleanup idempotente de abajo.
const EXTRAS = {
  managerEmail: 'demo-manager@turnogol.test',
  managerStaffUserId: 'a1000000-0000-4000-8000-000000000001',
  managerAuthUserId: 'a1000000-0000-4000-8000-000000000002',
  bookingDeudaViejaId: 'a1000000-0000-4000-8000-000000000010',
  bookingBloqueoManualId: 'a1000000-0000-4000-8000-000000000011',
  bookingSaldoPendienteId: 'a1000000-0000-4000-8000-000000000012',
  bookingNoShowId: 'a1000000-0000-4000-8000-000000000013',
  bookingHoldVivoId: 'a1000000-0000-4000-8000-000000000014',
  bookingRefundPendingId: 'a1000000-0000-4000-8000-000000000015',
  canteenTabIdemKey: 'a1000000-0000-4000-8000-000000000020',
  canteenTabDebtorName: 'Grupo del sábado (fiado — seed auditoría)',
  tournamentName: 'Torneo Relámpago — Auditoría',
  abonadoActiveId: 'a1000000-0000-4000-8000-000000000030',
  abonadoPausedId: 'a1000000-0000-4000-8000-000000000031',
  abonadoCanceledId: 'a1000000-0000-4000-8000-000000000032',
}

const FIXED_BOOKING_IDS = [
  EXTRAS.bookingDeudaViejaId,
  EXTRAS.bookingBloqueoManualId,
  EXTRAS.bookingSaldoPendienteId,
  EXTRAS.bookingNoShowId,
  EXTRAS.bookingHoldVivoId,
  EXTRAS.bookingRefundPendingId,
]

const ABONADO_IDS = [EXTRAS.abonadoActiveId, EXTRAS.abonadoPausedId, EXTRAS.abonadoCanceledId]

/**
 * Historial de 30 días (E1): un booking por día en offsets -1..-29, namespace
 * propio `a2…` para no competir con los `a1…` de arriba en el cleanup.
 */
const HISTORY_DAYS = 29
function historyBookingId(i: number): string {
  return `a2000000-0000-4000-8000-${String(i).padStart(12, '0')}`
}
const HISTORY_BOOKING_IDS = Array.from({ length: HISTORY_DAYS }, (_, idx) =>
  historyBookingId(idx + 1),
)

/** Dos de las 5 posibles (enum cerrado, `player-tags.ts`) — ninguna excluyente. */
const HISTORY_PLAYER_TAGS: readonly PlayerTag[] = ['group_organizer', 'agreed_price']

const SEED_NOTE = 'Sembrado por scripts/audit/seed-audit-extras.ts'

type SqlClient = ReturnType<typeof postgres>

function artOffset(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return formatInTimeZone(d, ART_TZ, 'yyyy-MM-dd')
}

/** Limpia SOLO lo que este script crea — nunca toca lo que sembró seed-demo-tenant.ts. */
async function cleanup(sql: SqlClient, yesterday: string): Promise<void> {
  const t = DEMO.tenantId
  // Torneos: tenant-wide es seguro acá — seed-demo-tenant.ts jamás crea filas
  // en estas tablas para este tenant. Hijos antes que padres (FK NO ACTION).
  await sql`DELETE FROM tournament_match_events WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournament_matches WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournament_team_players WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournament_teams WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournament_stages WHERE tenant_id = ${t}`
  // B5: la devolución pendiente antes que su booking (FK NO ACTION), igual
  // razón que tournament_matches arriba.
  await sql`DELETE FROM payments WHERE tenant_id = ${t} AND booking_id = ${EXTRAS.bookingRefundPendingId}`
  // Bookings propios: ids fijos + el historial de 30 días (E1) + type='tournament'
  // (seed-demo-tenant.ts solo crea 'spontaneous'). Antes de `tournaments`:
  // bookings.tournament_id es NO ACTION.
  await sql`
    DELETE FROM bookings
    WHERE tenant_id = ${t}
      AND (id IN ${sql([...FIXED_BOOKING_IDS, ...HISTORY_BOOKING_IDS])} OR type = 'tournament')
  `
  await sql`DELETE FROM tournaments WHERE tenant_id = ${t}`
  await sql`DELETE FROM tenant_player_bans WHERE tenant_id = ${t} AND player_id = ${DEMO.playerId}`
  // applyNoShowStrike (handleNoShow) es un CONTADOR que acumula, no un valor
  // idempotente: sin este reset, correr el script 3 veces deja noshow_count=3
  // en vez de 1. `tags` SÍ es nuestro desde que este script empezó a fijar las
  // etiquetas del jugador demo (ver seedPlayerTagsExtra) — se sobreescribe
  // siempre con el mismo set, así que no necesita un reset acá.
  await sql`
    UPDATE player_tenant_relationships
    SET noshow_count = 0, last_no_show_at = NULL
    WHERE tenant_id = ${t} AND player_id = ${DEMO.playerId}
  `
  // Cantina: canteen_tabs de este tenant son SIEMPRE de este script (seed-demo-tenant.ts no crea fiados).
  await sql`DELETE FROM stock_movements WHERE tenant_id = ${t} AND tab_id IS NOT NULL`
  await sql`DELETE FROM canteen_tabs WHERE tenant_id = ${t}`
  // Abonados (B1/B2): 3 fijos, sin bookings propios (no pasan por createAbonado).
  await sql`DELETE FROM abonados WHERE id IN ${sql(ABONADO_IDS)}`
  // Caja de AYER: seed-demo-tenant.ts sólo abre HOY, así que ayer es siempre nuestro.
  await sql`DELETE FROM cash_flows WHERE tenant_id = ${t} AND occurred_at::date = ${yesterday}::date`
  await sql`DELETE FROM daily_cash_closes WHERE tenant_id = ${t} AND date = ${yesterday}`
  await sql`DELETE FROM daily_cash_opens WHERE tenant_id = ${t} AND date = ${yesterday}`
  // E1: los cash_flows del historial no tienen id fijo (nada los referencia),
  // así que se identifican por description — único entre corridas y estable.
  await sql`DELETE FROM cash_flows WHERE tenant_id = ${t} AND description LIKE ${`${SEED_NOTE}%`}`
  // Manager
  await sql`DELETE FROM tenant_staff_members WHERE staff_user_id = ${EXTRAS.managerStaffUserId}`
  await sql`DELETE FROM staff_users WHERE id = ${EXTRAS.managerStaffUserId} OR email = ${EXTRAS.managerEmail}`
}

async function cleanupAuthUsers(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await supabase.auth.admin.deleteUser(EXTRAS.managerAuthUserId)
  if (error && !/not found/i.test(error.message)) throw error
}

/** (a) Manager (Encargado) — mismo patrón que scripts/seed-e2e.ts. */
async function seedManager(sql: SqlClient): Promise<void> {
  await sql`
    INSERT INTO staff_users (id, email, first_name, last_name)
    VALUES (${EXTRAS.managerStaffUserId}, ${EXTRAS.managerEmail}, ${'Rodrigo'}, ${'Encargado'})
  `
  await sql`
    INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role)
    VALUES (${DEMO.tenantId}, ${EXTRAS.managerStaffUserId}, 'manager')
  `
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await supabase.auth.admin.createUser({
    id: EXTRAS.managerAuthUserId,
    email: EXTRAS.managerEmail,
    email_confirm: true,
    password: E2E_TEST_PASSWORD,
    app_metadata: {
      tenant_id: DEMO.tenantId,
      role: 'manager',
      staff_user_id: EXTRAS.managerStaffUserId,
    },
  })
  if (error) throw error
}

/**
 * (b) Flag `tournaments` SOLO para este tenant (override, nunca la fila global
 * `tenant_id IS NULL`). `feature_flags` no tiene policy de escritura para
 * turnogol_app — por eso va por el canal de superusuario, igual que el resto
 * del cleanup. Índice único parcial: `uq_feature_flags_tenant` (015).
 */
async function enableTournamentsFlag(sql: SqlClient): Promise<void> {
  await sql`
    INSERT INTO feature_flags (key, value, tenant_id)
    VALUES ('tournaments', true, ${DEMO.tenantId})
    ON CONFLICT (key, tenant_id) WHERE tenant_id IS NOT NULL
    DO UPDATE SET value = true
  `
}

/**
 * Estados sucios #1, #3, #8 y la base de #9 (informe, sección "Estados sucios
 * a propósito"): INSERT directo — el trigger enforce_booking_invariants_fn
 * sólo dispara en UPDATE, nunca en INSERT (mismo razonamiento documentado en
 * scripts/seed-e2e.ts). #9 completo (softban por reincidencia) necesita el
 * flujo real: acá sólo se deja el booking `confirmed` ya terminado; handleNoShow
 * lo transiciona después, dentro de withTenantContext.
 */
async function seedDirtyBookings(sql: SqlClient, today: string, yesterday: string): Promise<void> {
  // #1 — Deuda de 30 días: completed, sin seña ni cash_flow que la salde.
  const deuda = bookingInstants({ date: artOffset(-30), timeStart: '19:00', timeEnd: '20:00' })
  await sql`
    INSERT INTO bookings (
      id, tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status,
      guest_name, created_by_staff, notes_internal
    ) VALUES (
      ${EXTRAS.bookingDeudaViejaId}, ${DEMO.tenantId}, ${DEMO.courtIds[0]},
      ${artOffset(-30)}, '19:00', '20:00', ${deuda.starts_at}, ${deuda.ends_at},
      'spontaneous', 'completed', 4000000, 0, 'not_required',
      ${'Grupo de los martes (deuda vieja)'}, ${DEMO.staffUserId}, ${SEED_NOTE}
    )
  `

  // #3 — Bloqueo manual de cancha (mantenimiento), hoy. type='block' nunca lo
  // usa seed-demo-tenant.ts, así que no compite por horario con su grilla.
  const bloqueo = bookingInstants({ date: today, timeStart: '10:00', timeEnd: '12:00' })
  await sql`
    INSERT INTO bookings (
      id, tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status,
      guest_name, created_by_staff, notes_internal
    ) VALUES (
      ${EXTRAS.bookingBloqueoManualId}, ${DEMO.tenantId}, ${DEMO.courtIds[3]},
      ${today}, '10:00', '12:00', ${bloqueo.starts_at}, ${bloqueo.ends_at},
      'block', 'confirmed', 0, 0, 'not_required',
      ${'Cancha en mantenimiento — pasto sintético'}, ${DEMO.staffUserId}, ${SEED_NOTE}
    )
  `

  // #8 — Seña pagada (30%) con saldo pendiente, hoy, a nombre del jugador demo.
  const saldo = bookingInstants({ date: today, timeStart: '10:00', timeEnd: '11:00' })
  await sql`
    INSERT INTO bookings (
      id, tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status, payment_method,
      created_by_staff, notes_internal
    ) VALUES (
      ${EXTRAS.bookingSaldoPendienteId}, ${DEMO.tenantId}, ${DEMO.courtIds[1]}, ${DEMO.playerId},
      ${today}, '10:00', '11:00', ${saldo.starts_at}, ${saldo.ends_at},
      'spontaneous', 'confirmed', 4000000, 1200000, 'paid', 'cash',
      ${DEMO.staffUserId}, ${SEED_NOTE}
    )
  `

  // #9 (base) — booking `confirmed` de AYER, ya terminado: handleNoShow lo
  // transiciona a `no_show` más abajo con el servicio real.
  const noshow = bookingInstants({ date: yesterday, timeStart: '19:00', timeEnd: '20:00' })
  await sql`
    INSERT INTO bookings (
      id, tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status,
      created_by_staff, notes_internal
    ) VALUES (
      ${EXTRAS.bookingNoShowId}, ${DEMO.tenantId}, ${DEMO.courtIds[0]}, ${DEMO.playerId},
      ${yesterday}, '19:00', '20:00', ${noshow.starts_at}, ${noshow.ends_at},
      'spontaneous', 'confirmed', 4000000, 0, 'not_required',
      ${DEMO.staffUserId}, ${SEED_NOTE}
    )
  `
}

/**
 * #2 — Hold vivo: pending_payment, created_at = NOW() (default de columna).
 * Expira a los 6 minutos (DEFAULT_EXPIRY_SECONDS) — por eso es la ÚLTIMA
 * escritura del script, justo antes de generar el fixture (ver main()).
 */
async function seedHoldVivo(sql: SqlClient, today: string): Promise<void> {
  const hold = bookingInstants({ date: today, timeStart: '10:00', timeEnd: '11:00' })
  await sql`
    INSERT INTO bookings (
      id, tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status,
      guest_name, created_by_staff, notes_internal
    ) VALUES (
      ${EXTRAS.bookingHoldVivoId}, ${DEMO.tenantId}, ${DEMO.courtIds[2]},
      ${today}, '10:00', '11:00', ${hold.starts_at}, ${hold.ends_at},
      'spontaneous', 'pending_payment', 4000000, 1200000, 'pending',
      ${'Reserva sin confirmar (hold)'}, ${DEMO.staffUserId}, ${SEED_NOTE}
    )
  `
}

/** #6 — Día de caja cerrado (ayer), con un ingreso adentro. */
async function seedClosedCajaDay(sql: SqlClient, yesterday: string): Promise<void> {
  const openingCash = 1500000
  const totalIncome = 3000000
  const expectedCash = openingCash + totalIncome
  const declaredCash = expectedCash - 30000

  await sql`
    INSERT INTO daily_cash_opens (tenant_id, date, opening_cash, opened_by)
    VALUES (${DEMO.tenantId}, ${yesterday}, ${openingCash}, ${DEMO.staffUserId})
  `
  await sql`
    INSERT INTO cash_flows (
      tenant_id, type, category, amount, method, description, registered_by, occurred_at
    ) VALUES (
      ${DEMO.tenantId}, 'income', 'other', ${totalIncome}, 'cash',
      ${`${SEED_NOTE} — alquiler cobrado directo`}, ${DEMO.staffUserId}, ${`${yesterday}T18:00:00-03:00`}::timestamptz
    )
  `
  await sql`
    INSERT INTO daily_cash_closes (
      tenant_id, date, total_income, total_adjustments, total_expense, balance,
      declared_cash, diff_amount, opening_cash, expected_cash, closed_by
    ) VALUES (
      ${DEMO.tenantId}, ${yesterday}, ${totalIncome}, 0, 0, ${totalIncome},
      ${declaredCash}, ${declaredCash - expectedCash}, ${openingCash}, ${expectedCash}, ${DEMO.staffUserId}
    )
  `
}

/**
 * B1/B2 — 3 abonados con los tres status, para que las píldoras de filtro de
 * `/abonados` no den todas 0. INSERT directo: sólo hay un trigger de
 * `updated_at` sobre esta tabla (no dispara en INSERT) y ninguna columna
 * generada — pasar por `createAbonado()` generaría además 8 semanas de
 * bookings que no vienen al caso acá.
 */
async function seedAbonados(sql: SqlClient): Promise<void> {
  const startsOn = artOffset(-60)

  // Contacto libre (player_id NULL): además puebla /jugadores, que deriva sus
  // "personas sin cuenta" de los abonados sueltos.
  await sql`
    INSERT INTO abonados (
      id, tenant_id, court_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session, starts_on, status, payment_method
    ) VALUES (
      ${EXTRAS.abonadoActiveId}, ${DEMO.tenantId}, ${DEMO.courtIds[0]},
      ${'Diego Fernández'}, ${'+5491155501234'},
      1, '20:00', '21:00', 4000000, ${startsOn}, 'active', 'cash'
    )
  `
  // Vinculado al jugador demo, en pausa.
  await sql`
    INSERT INTO abonados (
      id, tenant_id, court_id, player_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session, starts_on, status, payment_method
    ) VALUES (
      ${EXTRAS.abonadoPausedId}, ${DEMO.tenantId}, ${DEMO.courtIds[1]}, ${DEMO.playerId},
      ${'Tomás Rivero'}, ${'+5491155505678'},
      3, '19:00', '20:00', 4000000, ${startsOn}, 'paused', 'transfer'
    )
  `
  // Dado de baja, con endsOn cerrado.
  await sql`
    INSERT INTO abonados (
      id, tenant_id, court_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session, starts_on, ends_on, status, payment_method
    ) VALUES (
      ${EXTRAS.abonadoCanceledId}, ${DEMO.tenantId}, ${DEMO.courtIds[2]},
      ${'Grupo de los viernes (dado de baja)'}, ${'+5491155509876'},
      5, '18:00', '19:00', 4000000, ${startsOn}, ${artOffset(-7)}, 'canceled', 'cash'
    )
  `
}

/**
 * B5 — Booking ya cancelado con seña por devolver: mismo estado terminal que
 * deja `cancelBookingByPlayer` cuando había seña paga dentro de plazo
 * (`deposit_status` 'refunded' = "el complejo la debe", no que ya se devolvió).
 * La devolución en sí (fila en `payments`) la crea `seedPendingRefund`, más
 * abajo, con el servicio real.
 */
async function seedRefundBooking(sql: SqlClient): Promise<void> {
  const date = artOffset(-3)
  const { starts_at, ends_at } = bookingInstants({ date, timeStart: '20:00', timeEnd: '21:00' })
  await sql`
    INSERT INTO bookings (
      id, tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status, payment_method,
      canceled_by, canceled_at, canceled_reason, created_by_staff, notes_internal
    ) VALUES (
      ${EXTRAS.bookingRefundPendingId}, ${DEMO.tenantId}, ${DEMO.courtIds[1]}, ${DEMO.playerId},
      ${date}, '20:00', '21:00', ${starts_at}, ${ends_at},
      'spontaneous', 'canceled_refunded', 4000000, 1200000, 'refunded', 'cash',
      'player', NOW(),
      ${'Se cayeron jugadores del equipo — cancelación dentro de plazo (demo auditoría).'},
      ${DEMO.staffUserId}, ${SEED_NOTE}
    )
  `
}

const HISTORY_SLOTS: ReadonlyArray<readonly [string, string]> = [
  ['09:00', '10:00'],
  ['11:00', '12:00'],
  ['15:00', '16:00'],
  ['17:00', '18:00'],
  ['19:00', '20:00'],
  ['21:00', '22:00'],
]
// 70% completed / 10% no_show / 10% canceled_refunded / 10% canceled_no_refund
// — la misma proporción que separa "turnos jugados" de "estados terminales
// raros" en cualquier complejo real.
const HISTORY_STATUS_CYCLE = [
  'completed',
  'completed',
  'completed',
  'completed',
  'no_show',
  'completed',
  'completed',
  'canceled_refunded',
  'completed',
  'canceled_no_refund',
] as const
const HISTORY_PAYMENT_METHODS = ['cash', 'transfer', 'mercadopago'] as const

/**
 * E1 — Historial de 30 días: un booking por día (offsets -1..-29), rotando las
 * 4 canchas y 6 horarios, con la mezcla de estados de arriba. Cada `completed`
 * deja además un `cash_flows` de ingreso con método rotado, así `/analiticas`
 * (`getTenantMetrics`, ventana de 30 días) y la caja dejan de tener un solo
 * punto. `payment_method` del booking queda NULL a propósito (igual que un
 * walk-in cobrado en el momento, sin seña): la variedad de medios de pago vive
 * en `cash_flows`, no hace falta duplicarla acá.
 */
async function seedBookingHistory(sql: SqlClient): Promise<void> {
  for (let i = 1; i <= HISTORY_DAYS; i++) {
    const date = artOffset(-i)
    const court = DEMO.courtIds[i % DEMO.courtIds.length]
    const [timeStart, timeEnd] = HISTORY_SLOTS[i % HISTORY_SLOTS.length]
    const status = HISTORY_STATUS_CYCLE[i % HISTORY_STATUS_CYCLE.length]
    const { starts_at, ends_at } = bookingInstants({ date, timeStart, timeEnd })

    await sql`
      INSERT INTO bookings (
        id, tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status,
        guest_name, created_by_staff, notes_internal
      ) VALUES (
        ${historyBookingId(i)}, ${DEMO.tenantId}, ${court}, ${date}, ${timeStart}, ${timeEnd},
        ${starts_at}, ${ends_at},
        'spontaneous', ${status}, 4000000, 0, 'not_required',
        ${`Historial auditoría #${i}`}, ${DEMO.staffUserId}, ${SEED_NOTE}
      )
    `

    if (status === 'completed') {
      const method = HISTORY_PAYMENT_METHODS[i % HISTORY_PAYMENT_METHODS.length]
      await sql`
        INSERT INTO cash_flows (
          tenant_id, type, category, amount, method, description, registered_by, occurred_at
        ) VALUES (
          ${DEMO.tenantId}, 'income', 'booking', 4000000, ${method},
          ${`${SEED_NOTE} — cobro turno histórico`}, ${DEMO.staffUserId}, ${ends_at}::timestamptz
        )
      `
    }
  }
}

/** C2 — Pausa UNA de las 4 canchas (deja 3 online), vía el servicio real. */
async function seedCourtOffline(tx: DbTx): Promise<void> {
  await toggleStatus(DEMO.courtIds[3]!, DEMO.tenantId, 'offline', tx)
}

/** Etiquetas del jugador demo (enum cerrado de 5, `player-tags.ts`). */
async function seedPlayerTagsExtra(tx: DbTx): Promise<void> {
  await setPlayerTags(DEMO.tenantId, DEMO.playerId, HISTORY_PLAYER_TAGS, tx)
}

/**
 * B5 — La devolución en sí: mismo servicio real que usa `cancelBookingByPlayer`
 * (`registerRefundDue` → `prepareManualRefund`), para que `listPendingRefunds`
 * lea exactamente las columnas que espera (a quién, cuánto, de qué reserva).
 */
async function seedPendingRefund(tx: DbTx): Promise<void> {
  await prepareManualRefund(
    {
      bookingId: EXTRAS.bookingRefundPendingId,
      tenantId: DEMO.tenantId,
      playerId: DEMO.playerId,
      amount: 1200000,
      paymentMethod: 'cash',
    },
    tx,
  )
}

/** #3 — Bloqueo manual del JUGADOR (tenant_player_bans), vía el servicio real. */
async function seedPlayerBan(tx: DbTx): Promise<void> {
  await banPlayerManually(
    DEMO.tenantId,
    DEMO.playerId,
    DEMO.staffUserId,
    'Discusión con otro grupo en cancha — bloqueo preventivo (demo auditoría).',
    resolveManualBanUntil('30d', new Date()),
    tx,
  )
}

/**
 * #4 — Torneo con equipos, planteles, hora reservada, fixture, resultado y
 * acta cargada. Cadena de *.service.ts reales — nunca INSERT directo (columnas
 * generadas + checks cruzados, ver informe).
 */
async function seedTournament(
  tx: DbTx,
  tomorrow: string,
): Promise<{ tournamentId: string; tournamentMatchId: string; deTorneoBookingId: string | null }> {
  const tournament = await createTournament(
    DEMO.tenantId,
    DEMO.staffUserId,
    { name: EXTRAS.tournamentName, format: 'league', startsOn: tomorrow, inscriptionFee: 0 },
    tx,
  )

  const team = (name: string) =>
    addTeam(DEMO.tenantId, DEMO.staffUserId, tournament.id, { name }, tx)
  const player = (teamId: string, fullName: string, shirtNumber: number) =>
    addTeamPlayer(DEMO.tenantId, DEMO.staffUserId, teamId, { fullName, shirtNumber }, tx)

  const teamA = await team('Los Fierros FC')
  const teamB = await team('Atlético Demo')
  await player(teamA.id, 'Franco Ríos', 10)
  const scorerA = await player(teamA.id, 'Bruno Sosa', 7)
  const scorerB = await player(teamB.id, 'Ezequiel Paz', 9)
  await player(teamB.id, 'Nahuel Díaz', 4)

  await reserveTournamentSlots(
    DEMO.tenantId,
    tournament.id,
    DEMO.staffUserId,
    { courtIds: [DEMO.courtIds[0]!], dates: [tomorrow], timeStart: '10:00', timeEnd: '11:00' },
    tx,
  )

  await generateFixture(
    DEMO.tenantId,
    DEMO.staffUserId,
    tournament.id,
    { legs: 1, autoSchedule: true },
    tx,
  )

  const matchRows = (await tx.execute(drizzleSql`
    SELECT id, booking_id AS "bookingId", home_team_id AS "homeTeamId", away_team_id AS "awayTeamId"
    FROM tournament_matches
    WHERE tenant_id = ${DEMO.tenantId} AND tournament_id = ${tournament.id}
    LIMIT 1
  `)) as unknown as Array<{
    id: string
    bookingId: string | null
    homeTeamId: string | null
    awayTeamId: string | null
  }>
  const match = matchRows[0]
  if (!match)
    throw new Error('generateFixture no generó ningún partido — no debería pasar con 2 equipos.')

  // El round-robin ordena los equipos alfabéticamente (activeTeamIds, ORDER BY
  // lower(trim(name))), no por orden de alta — "Atlético Demo" queda antes que
  // "Los Fierros FC". No se puede asumir teamA=local: hay que leer home/away
  // del partido ya generado y mapear el goleador de CADA lado.
  const homeTeam =
    match.homeTeamId === teamA.id
      ? { team: teamA, scorer: scorerA }
      : { team: teamB, scorer: scorerB }
  const awayTeam =
    match.awayTeamId === teamA.id
      ? { team: teamA, scorer: scorerA }
      : { team: teamB, scorer: scorerB }

  await saveMatchResult(
    DEMO.tenantId,
    DEMO.staffUserId,
    { matchId: match.id, homeScore: 2, awayScore: 1 },
    tx,
  )

  // Acta: 2 goles del local (uno con amarilla incluida) + 1 del visitante —
  // exactamente el 2-1 de arriba, para no chocar con assertGoalsFitScore.
  const events: Array<{
    teamId: string
    teamPlayerId: string
    type: 'goal' | 'yellow_card'
    minute: number
  }> = [
    { teamId: homeTeam.team.id, teamPlayerId: homeTeam.scorer.id, type: 'goal', minute: 12 },
    { teamId: homeTeam.team.id, teamPlayerId: homeTeam.scorer.id, type: 'goal', minute: 34 },
    { teamId: awayTeam.team.id, teamPlayerId: awayTeam.scorer.id, type: 'goal', minute: 50 },
    { teamId: homeTeam.team.id, teamPlayerId: homeTeam.scorer.id, type: 'yellow_card', minute: 40 },
  ]
  for (const ev of events) {
    await addMatchEvent(DEMO.tenantId, DEMO.staffUserId, { matchId: match.id, ...ev }, tx)
  }

  return {
    tournamentId: tournament.id,
    tournamentMatchId: match.id,
    deTorneoBookingId: match.bookingId,
  }
}

/** #5 — Cantina con fiado abierto, sobre un producto YA sembrado por seed-demo-tenant.ts. */
async function seedCanteenTab(tx: DbTx): Promise<void> {
  const products = await tx
    .select({ id: canteenProducts.id })
    .from(canteenProducts)
    .where(and(eq(canteenProducts.tenantId, DEMO.tenantId), eq(canteenProducts.isActive, true)))
    .orderBy(asc(canteenProducts.sortOrder))
    .limit(1)

  const product = products[0]
  if (!product) {
    console.warn('  [aviso] sin canteen_products activos — se salteó el fiado (estado #5).')
    return
  }

  await createTab(
    DEMO.tenantId,
    DEMO.staffUserId,
    {
      debtorName: EXTRAS.canteenTabDebtorName,
      lines: [{ productId: product.id, qty: 2 }],
      note: SEED_NOTE,
      clientIdempotencyKey: EXTRAS.canteenTabIdemKey,
    },
    tx,
  )
}

/** #9 — No-show real: softban por reincidencia vía handleNoShow (nunca UPDATE a mano). */
async function seedNoShow(tx: DbTx): Promise<void> {
  await handleNoShow(EXTRAS.bookingNoShowId, DEMO.staffUserId, tx)
}

type Fixture = {
  tenantId: string
  tenantSlug: string
  adminEmail: string
  managerEmail: string
  playerId: string
  courtIds: string[]
  bookingIds: {
    conSaldoPendiente: string
    holdVivo: string | null
    bloqueoManual: string
    noShow: string
    deudaVieja: string
    deTorneo: string | null
  }
  tournamentId: string
  tournamentMatchId: string
  cajaFechaCerrada: string
  generadoEn: string
}

async function main(): Promise<void> {
  const today = artOffset(0)
  const yesterday = artOffset(-1)
  const tomorrow = artOffset(1)

  const sql = postgres(SEED_ADMIN_URL, { max: 1, prepare: false, onnotice: () => {} })
  let tournamentId = ''
  let tournamentMatchId = ''
  let deTorneoBookingId: string | null = null
  try {
    await cleanupAuthUsers()
    await cleanup(sql, yesterday)

    await seedManager(sql)
    await enableTournamentsFlag(sql)
    await seedDirtyBookings(sql, today, yesterday)
    await seedClosedCajaDay(sql, yesterday)
    await seedAbonados(sql)
    await seedRefundBooking(sql)
    await seedBookingHistory(sql)

    await withTenantContext(DEMO.tenantId, seedPlayerBan)
    await withTenantContext(DEMO.tenantId, seedPendingRefund)
    await withTenantContext(DEMO.tenantId, seedCourtOffline)
    await withTenantContext(DEMO.tenantId, seedPlayerTagsExtra)

    const tournamentResult = await withTenantContext(DEMO.tenantId, (tx) =>
      seedTournament(tx, tomorrow),
    )
    tournamentId = tournamentResult.tournamentId
    tournamentMatchId = tournamentResult.tournamentMatchId
    deTorneoBookingId = tournamentResult.deTorneoBookingId

    await withTenantContext(DEMO.tenantId, seedCanteenTab)
    await withTenantContext(DEMO.tenantId, seedNoShow)

    // Última escritura: maximiza la ventana de 6 minutos del hold vivo antes
    // de que el sweep de background jobs lo expire.
    await seedHoldVivo(sql, today)

    const fixture: Fixture = {
      tenantId: DEMO.tenantId,
      tenantSlug: DEMO.tenantSlug,
      adminEmail: DEMO.adminEmail,
      managerEmail: EXTRAS.managerEmail,
      playerId: DEMO.playerId,
      courtIds: DEMO.courtIds,
      bookingIds: {
        conSaldoPendiente: EXTRAS.bookingSaldoPendienteId,
        holdVivo: EXTRAS.bookingHoldVivoId,
        bloqueoManual: EXTRAS.bookingBloqueoManualId,
        noShow: EXTRAS.bookingNoShowId,
        deudaVieja: EXTRAS.bookingDeudaViejaId,
        deTorneo: deTorneoBookingId,
      },
      tournamentId,
      tournamentMatchId,
      cajaFechaCerrada: yesterday,
      generadoEn: new Date().toISOString(),
    }
    writeFileSync(
      new URL('.corpus-fixture.json', import.meta.url),
      `${JSON.stringify(fixture, null, 2)}\n`,
    )

    console.log('Audit extras seed OK — tenant demo la-redonda')
    console.log(`  manager: ${EXTRAS.managerEmail}`)
    console.log(`  torneo: ${tournamentId} (partido ${tournamentMatchId})`)
    console.log(`  abonados: 3 (active/paused/canceled) · historial: ${HISTORY_DAYS} bookings`)
    console.log('  devolución pendiente: 1 · cancha offline: 1 de 4 · etiquetas jugador: 2')
    console.log(
      '  flag tournaments: ON solo para este tenant (caché 60s — reiniciar dev si ya sirvió requests)',
    )
    console.log('  fixture: scripts/audit/.corpus-fixture.json')
  } finally {
    await sql.end()
    await closeSql()
  }
}

main().catch((e) => {
  console.error('Audit extras seed failed:', e)
  process.exit(1)
})
