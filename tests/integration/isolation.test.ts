/**
 * RLS isolation suite — BLOCKING.
 * Comment out any policy in 006_rls_policies.sql (o 014–017 para las tablas
 * post-021) → at least 1 test must fail.
 *
 * Coverage:
 *  A. Smoke positivo: tenant SÍ ve sus filas (13)
 *  B. Cross-tenant SELECT bloqueado (13)
 *  C. Cross-tenant INSERT bloqueado (13)
 *  D. Cross-tenant UPDATE bloqueado (10)
 *  E. Cross-tenant DELETE bloqueado (10)
 *  F. PTR cross-tenant UPDATE bloqueado (1)
 *  G. REVOKE: UPDATE/DELETE en audit_logs+daily_cash_closes propios falla (4)
 *  H. Fail-safe: sin contexto, 0 filas (17)
 *  I. Casos especiales (5)
 *  J. Positive policies — cierre de gaps
 *  K. Positive relational reads
 *  L. Tablas RLS post-021 (push_subscriptions, player_favorites, feature_flags, reviews) (7)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { faker } from '@faker-js/faker'
import {
  closeSql,
  getSql,
  withContext,
  withContextRollback,
} from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestSystemAdmin,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'
import { getOrCreatePlanId, insertBooking } from '../helpers/factories'

faker.seed(42)

type Tenant = { id: string; slug: string; name: string }

let tenantA: Tenant
let tenantB: Tenant
let A: IsolationSeed
let B: IsolationSeed
let planId: string
let extraPlayerA: { id: string; email: string }
// Tablas RLS post-021 (TG-BL-01): 1 fila sembrada de tenant A para que el
// fail-safe (bloque H) y los cross-tenant/cross-player de L sean reales.
let pushSubA: string
let favA: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenantA = await createTestTenant(sql)
  tenantB = await createTestTenant(sql)
  A = await seedIsolationData(sql, tenantA.id)
  B = await seedIsolationData(sql, tenantB.id)
  planId = await getOrCreatePlanId(sql)
  // Extra player attached to tenant A — used by I.4 (player without PTR-with-A test).
  extraPlayerA = await createTestPlayer(sql)

  // TG-BL-01: sembrar 1 fila en las tablas RLS post-021 con aislamiento clásico.
  // Sin fila la tabla queda vacía y el count=0 del fail-safe daría verde aunque
  // la policy estuviera rota (false green). getSql() es superuser → bypassa RLS.
  const [ps] = await sql`
    INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
    VALUES (${tenantA.id}, ${A.staffUserId}, ${`https://push.test/${tenantA.id}`}, 'p256dh-test', 'auth-test')
    RETURNING id
  `
  pushSubA = (ps as { id: string }).id
  const [fav] = await sql`
    INSERT INTO player_favorites (player_id, tenant_id)
    VALUES (${A.playerId}, ${tenantA.id})
    RETURNING id
  `
  favA = (fav as { id: string }).id
}, 30_000)

afterAll(async () => {
  await closeSql()
})

// ─── Table catalog ──────────────────────────────────────────────
type TableDef = {
  name: string
  ownId: () => string
  otherId: () => string
}

const tablesAll: TableDef[] = [
  { name: 'courts', ownId: () => A.courtId, otherId: () => B.courtId },
  { name: 'tenant_staff_members', ownId: () => A.staffMemberId, otherId: () => B.staffMemberId },
  { name: 'tenant_subscriptions', ownId: () => A.subscriptionId, otherId: () => B.subscriptionId },
  { name: 'products', ownId: () => A.productId, otherId: () => B.productId },
  { name: 'abonados', ownId: () => A.abonadoId, otherId: () => B.abonadoId },
  { name: 'payments', ownId: () => A.paymentId, otherId: () => B.paymentId },
  { name: 'cash_flows', ownId: () => A.cashFlowId, otherId: () => B.cashFlowId },
  { name: 'daily_cash_closes', ownId: () => A.dailyCashCloseId, otherId: () => B.dailyCashCloseId },
  { name: 'notifications', ownId: () => A.notificationId, otherId: () => B.notificationId },
  { name: 'audit_logs', ownId: () => A.auditLogId, otherId: () => B.auditLogId },
  { name: 'tenant_player_bans', ownId: () => A.banId, otherId: () => B.banId },
  { name: 'bookings', ownId: () => A.bookingId, otherId: () => B.bookingId },
  { name: 'player_tenant_relationships', ownId: () => A.ptrId, otherId: () => B.ptrId },
]

// Tables with UPDATE policy (RLS allows UPDATE if context matches).
// Excludes audit_logs/daily_cash_closes (no UPDATE policy) and PTR (handled separately in F).
const tablesUpdDel = tablesAll.filter(
  (t) =>
    !['audit_logs', 'daily_cash_closes', 'player_tenant_relationships'].includes(
      t.name,
    ),
)

// All RLS tables with tenant/player isolation for the fail-safe (no context) test.
// Incluye 2 tablas post-021 con aislamiento clásico (TG-BL-01); feature_flags y
// reviews NO entran acá (lectura global/pública por diseño → count>0 sin contexto)
// y se cubren con fail-safe de escritura en el bloque L.
const failSafeTables = [
  ...tablesAll.map((t) => t.name),
  'players',
  'staff_users',
  'push_subscriptions',
  'player_favorites',
]

// ─── A. Smoke positivo ─────────────────────────────────────────
describe('A. tenant SÍ ve sus propias filas (smoke positivo)', () => {
  for (const t of tablesAll) {
    it(`${t.name}: tenant A ve su fila (staff context)`, async () => {
      // Staff-only context: NO playerId. Garantiza que tenant_isolation_select sea
      // el camino exclusivo (sin que player_own_* enmascare el bug si lo comentás).
      const rows = await withContext(
        { role: 'authenticated', tenantId: tenantA.id },
        (tx) => tx.unsafe(`SELECT id FROM ${t.name} WHERE id = $1`, [t.ownId()]),
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
    })
  }
})

// ─── B. Cross-tenant SELECT bloqueado ─────────────────────────
describe('B. cross-tenant SELECT bloqueado', () => {
  for (const t of tablesAll) {
    it(`${t.name}: tenant B no ve fila de A`, async () => {
      const rows = await withContext(
        { role: 'authenticated', tenantId: tenantB.id },
        (tx) => tx.unsafe(`SELECT id FROM ${t.name} WHERE id = $1`, [t.ownId()]),
      )
      expect(rows.length).toBe(0)
    })
  }
})

// ─── C. Cross-tenant INSERT bloqueado ─────────────────────────
type InsertFn = (tx: import('postgres').TransactionSql, foreignTenantId: string) => Promise<unknown>

const insertOps: Record<string, InsertFn> = {
  courts: async (tx, tid) =>
    tx`INSERT INTO courts (tenant_id, name, capacity) VALUES (${tid}, 'spoof', 10)`,
  tenant_staff_members: async (tx, tid) =>
    tx`INSERT INTO tenant_staff_members (tenant_id, staff_user_id) VALUES (${tid}, ${B.staffUserId})`,
  tenant_subscriptions: async (tx, tid) => {
    const start = new Date()
    const end = new Date(start.getTime() + 30 * 86400000)
    return tx`INSERT INTO tenant_subscriptions (tenant_id, plan_id, current_period_start, current_period_end)
      VALUES (${tid}, ${planId}, ${start}, ${end})`
  },
  products: async (tx, tid) =>
    tx`INSERT INTO products (tenant_id, name, price) VALUES (${tid}, 'spoof', 1000)`,
  abonados: async (tx, tid) =>
    tx`INSERT INTO abonados (
      tenant_id, court_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session, starts_on
    ) VALUES (${tid}, ${B.courtId}, 'spoof', '111', 1, '20:00', '21:00', 1000, ${new Date().toISOString().slice(0, 10)})`,
  payments: async (tx, tid) =>
    tx`INSERT INTO payments (tenant_id, amount, type, method, status)
      VALUES (${tid}, 1000, 'full_payment', 'cash', 'approved')`,
  cash_flows: async (tx, tid) =>
    tx`INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES (${tid}, 'income', 'booking', 1000, 'cash', 'spoof', ${B.staffUserId}, NOW())`,
  daily_cash_closes: async (tx, tid) =>
    tx`INSERT INTO daily_cash_closes (tenant_id, date, total_income, total_adjustments, balance, declared_cash, diff_amount, closed_by)
      VALUES (${tid}, ${faker.date.future().toISOString().slice(0, 10)}, 0, 0, 0, 0, 0, ${B.staffUserId})`,
  // recipient_id debe ser VÁLIDO bajo el contexto que inserta (tenant A) para
  // que el INSERT llegue a la WITH CHECK de tenant RLS en vez de morir en el
  // trigger recipient-FK. Con B.playerId tiraba 23503 (recipient no existe) y
  // la policy tenant_isolation_insert NUNCA se ejercitaba → falso verde.
  notifications: async (tx, tid) =>
    tx`INSERT INTO notifications (tenant_id, recipient_type, recipient_id, channel, trigger_event, content)
      VALUES (${tid}, 'player', ${A.playerId}, 'email', 'spoof', ${tx.json({ subject: 'x' })})`,
  audit_logs: async (tx, tid) =>
    tx`INSERT INTO audit_logs (tenant_id, actor_id, actor_type, action, resource_type, resource_id)
      VALUES (${tid}, ${B.staffUserId}, 'staff', 'spoof', 'booking', ${B.bookingId})`,
  tenant_player_bans: async (tx, tid) =>
    tx`INSERT INTO tenant_player_bans (tenant_id, player_id, reason)
      VALUES (${tid}, ${B.playerId}, 'spoof')`,
  bookings: async (tx, tid) => {
    const date = faker.date.future().toISOString().slice(0, 10)
    return tx`INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        price_snapshot, deposit_amount, deposit_status, payment_method
      )
      VALUES (
        ${tid}, ${B.courtId}, ${date}, '10:00', '11:00',
        (${date}::date + '10:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (${date}::date + '11:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        100000, 0, 'not_required', NULL
      )`
  },
  // Usar un player EXISTENTE (el de A). La versión anterior insertaba un player
  // fresco primero, que falla RLS en `players` (sin policy INSERT para
  // authenticated) → el error era sobre la tabla "players", NO
  // "player_tenant_relationships". La policy de INSERT de PTR nunca se probaba.
  player_tenant_relationships: async (tx, tid) =>
    tx`INSERT INTO player_tenant_relationships (tenant_id, player_id) VALUES (${tid}, ${A.playerId})`,
}

describe('C. cross-tenant INSERT bloqueado', () => {
  for (const t of tablesAll) {
    it(`${t.name}: tenant A no inserta con tenant_id de B`, async () => {
      const op = insertOps[t.name]
      expect(op).toBeDefined()
      // Fijar el rechazo a RLS SOBRE ESTA TABLA. El .toThrow() pelado pasaba por
      // la razón equivocada en notifications (23503) y PTR (RLS en "players"),
      // ocultando si la tenant_isolation_insert de cada tabla realmente dispara.
      await expect(
        withContextRollback({ role: 'authenticated', tenantId: tenantA.id }, (tx) =>
          op(tx, tenantB.id),
        ),
      ).rejects.toThrow(
        new RegExp(`row-level security policy for table "${t.name}"`, 'i'),
      )
    })
  }
})

// ─── D. Cross-tenant UPDATE bloqueado ──────────────────────────
describe('D. cross-tenant UPDATE bloqueado', () => {
  for (const t of tablesUpdDel) {
    it(`${t.name}: tenant B no UPDATE fila de A`, async () => {
      const rows = await withContextRollback(
        { role: 'authenticated', tenantId: tenantB.id },
        (tx) =>
          tx.unsafe(
            `UPDATE ${t.name} SET tenant_id = tenant_id WHERE id = $1 RETURNING id`,
            [t.ownId()],
          ),
      )
      expect((rows as unknown[]).length).toBe(0)
    })
  }
})

// ─── E. Cross-tenant DELETE bloqueado ──────────────────────────
describe('E. cross-tenant DELETE bloqueado', () => {
  for (const t of tablesUpdDel) {
    it(`${t.name}: tenant B no DELETE fila de A`, async () => {
      const rows = await withContextRollback(
        { role: 'authenticated', tenantId: tenantB.id },
        (tx) =>
          tx.unsafe(
            `DELETE FROM ${t.name} WHERE id = $1 RETURNING id`,
            [t.ownId()],
          ),
      )
      expect((rows as unknown[]).length).toBe(0)
    })
  }
})

// ─── F. PTR cross-tenant UPDATE ────────────────────────────────
describe('F. PTR cross-tenant UPDATE bloqueado', () => {
  it('player_tenant_relationships: tenant B no UPDATE fila de A', async () => {
    const rows = await withContextRollback(
      { role: 'authenticated', tenantId: tenantB.id },
      (tx) =>
        tx.unsafe(
          `UPDATE player_tenant_relationships SET status = 'active' WHERE id = $1 RETURNING id`,
          [A.ptrId],
        ),
    )
    expect((rows as unknown[]).length).toBe(0)
  })
})

// ─── G. REVOKE: UPDATE/DELETE en append-only falla ─────────────
describe('G. REVOKE en append-only', () => {
  it('audit_logs: UPDATE propio falla con permission denied', async () => {
    await expect(
      withContextRollback(
        { role: 'turnogol_app', tenantId: tenantA.id },
        (tx) =>
          tx.unsafe(`UPDATE audit_logs SET action = 'tampered' WHERE id = $1`, [
            A.auditLogId,
          ]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('audit_logs: DELETE propio falla con permission denied', async () => {
    await expect(
      withContextRollback(
        { role: 'turnogol_app', tenantId: tenantA.id },
        (tx) =>
          tx.unsafe(`DELETE FROM audit_logs WHERE id = $1`, [A.auditLogId]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('daily_cash_closes: UPDATE propio falla con permission denied', async () => {
    await expect(
      withContextRollback(
        { role: 'turnogol_app', tenantId: tenantA.id },
        (tx) =>
          tx.unsafe(
            `UPDATE daily_cash_closes SET declared_cash = 999 WHERE id = $1`,
            [A.dailyCashCloseId],
          ),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('daily_cash_closes: DELETE propio falla con permission denied', async () => {
    await expect(
      withContextRollback(
        { role: 'turnogol_app', tenantId: tenantA.id },
        (tx) =>
          tx.unsafe(`DELETE FROM daily_cash_closes WHERE id = $1`, [
            A.dailyCashCloseId,
          ]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })
})

// ─── H. Fail-safe: sin contexto, 0 filas ───────────────────────
describe('H. fail-safe: sin contexto seteado, 0 filas', () => {
  for (const tableName of failSafeTables) {
    it(`${tableName}: SELECT sin contexto → 0 filas`, async () => {
      // Role authenticated, no SET LOCAL para app.current_*.
      const rows = await withContext(
        { role: 'authenticated' },
        (tx) => tx.unsafe(`SELECT count(*)::int AS c FROM ${tableName}`),
      )
      expect((rows as unknown as { c: number }[])[0].c).toBe(0)
    })
  }
})

// ─── I. Casos especiales ───────────────────────────────────────
describe('I. casos especiales', () => {
  it('I.1 player A no ve bookings de player B (mismo tenant)', async () => {
    // Crear segundo player + booking en tenant A.
    const sql = getSql()
    const playerC = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, tenantA.id, playerC.id)
    const bookingC = await insertBooking(sql, {
      tenantId: tenantA.id,
      courtId: A.courtId,
      playerId: playerC.id,
      timeStart: '16:00',
      timeEnd: '17:00',
    })

    // Como playerC SÍ ve su booking. Como original A.playerId NO debería ver el de playerC
    // bajo policy player_own_bookings_select (sin context tenant).
    const rows = await withContext(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${bookingC}`,
    )
    expect(rows.length).toBe(0)
  })

  it('I.2 realtime: JWT con tenant_id ajeno → 0 bookings de tenant A', async () => {
    const rows = await withContext(
      {
        role: 'authenticated',
        jwtClaims: { app_metadata: { tenant_id: tenantB.id } },
      },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
    )
    expect(rows.length).toBe(0)
  })

  it('I.3 staff A no ve email de staff B', async () => {
    const rows = await withContext(
      { role: 'authenticated', tenantId: tenantA.id },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM staff_users WHERE id = ${B.staffUserId}`,
    )
    expect(rows.length).toBe(0)
  })

  it('I.4 staff A no ve PII de player sin PTR-con-A', async () => {
    // extraPlayerA fue creado pero NO linkeado a ningún tenant.
    const rows = await withContext(
      { role: 'authenticated', tenantId: tenantA.id },
      (tx) =>
        tx<{ email: string }[]>`SELECT email FROM players WHERE id = ${extraPlayerA.id}`,
    )
    expect(rows.length).toBe(0)
  })

  it('I.5 jugador baneado en A ve su propio ban vía player_own_bans_select', async () => {
    const rows = await withContext(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM tenant_player_bans WHERE id = ${A.banId}`,
    )
    expect(rows.length).toBe(1)
  })
})

// ─── J. Positive policies (cierre de gaps) ─────────────────────
// Mutation-checked 2026-05-23: commenting any of the 4 policies in
// 006_rls_policies.sql produces at least 1 red in this block.
describe('J. positive policies (cierre de gaps)', () => {
  it('player_update_self: jugador A actualiza su propia fila en players', async () => {
    const newFirstName = `n${Date.now()}`
    const rows = await withContextRollback(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string; first_name: string }[]>`
          UPDATE players SET first_name = ${newFirstName}
          WHERE id = ${A.playerId}
          RETURNING id, first_name
        `,
    )
    expect(rows.length).toBe(1)
    expect(rows[0].first_name).toBe(newFirstName)
  })

  it('player_update_self: jugador A NO puede actualizar fila de B', async () => {
    const rows = await withContextRollback(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string }[]>`
          UPDATE players SET first_name = 'hacked'
          WHERE id = ${B.playerId}
          RETURNING id
        `,
    )
    expect(rows.length).toBe(0)
  })

  it('player_self_insert (bookings): jugador A inserta booking a su nombre', async () => {
    const date = faker.date.future().toISOString().slice(0, 10)
    const inserted = await withContextRollback(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string }[]>`
          INSERT INTO bookings (
            tenant_id, court_id, player_id, date, time_start, time_end,
            starts_at, ends_at,
            price_snapshot, deposit_amount, deposit_status, payment_method
          )
          VALUES (
            ${tenantA.id}, ${A.courtId}, ${A.playerId},
            ${date},
            '10:00', '11:00',
            (${date}::date + '10:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
            (${date}::date + '11:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
            100000, 0, 'not_required', NULL
          )
          RETURNING id
        `,
    )
    expect(inserted.length).toBe(1)
  })

  it('player_self_insert: jugador A NO puede insertar booking con player_id de B', async () => {
    const date = faker.date.future().toISOString().slice(0, 10)
    await expect(
      withContextRollback(
        { role: 'authenticated', playerId: A.playerId },
        (tx) =>
          tx`
            INSERT INTO bookings (
              tenant_id, court_id, player_id, date, time_start, time_end,
              starts_at, ends_at,
              price_snapshot, deposit_amount, deposit_status, payment_method
            )
            VALUES (
              ${tenantA.id}, ${A.courtId}, ${B.playerId},
              ${date},
              '12:00', '13:00',
              (${date}::date + '12:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
              (${date}::date + '13:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
              100000, 0, 'not_required', NULL
            )
          `,
      ),
    ).rejects.toThrow(/row-level security policy for table "bookings"/i)
  })

  it('player_self_ptr_insert: jugador fresco crea su propia relación con tenant B', async () => {
    const sql = getSql()
    const freshPlayer = await createTestPlayer(sql)
    const rows = await withContextRollback(
      { role: 'authenticated', playerId: freshPlayer.id },
      (tx) =>
        tx<{ id: string }[]>`
          INSERT INTO player_tenant_relationships (tenant_id, player_id)
          VALUES (${tenantB.id}, ${freshPlayer.id})
          RETURNING id
        `,
    )
    expect(rows.length).toBe(1)
  })

  it('player_self_ptr_insert: jugador A NO puede insertar PTR a nombre de B', async () => {
    await expect(
      withContextRollback(
        { role: 'authenticated', playerId: A.playerId },
        (tx) =>
          tx`
            INSERT INTO player_tenant_relationships (tenant_id, player_id)
            VALUES (${tenantB.id}, ${B.playerId})
          `,
      ),
    ).rejects.toThrow(
      /row-level security policy for table "player_tenant_relationships"/i,
    )
  })

  it('system_admin_self: super admin ve SU PROPIA fila', async () => {
    const sql = getSql()
    const sa = await createTestSystemAdmin(sql)
    const rows = await withContext(
      { role: 'authenticated', systemAdminId: sa.id },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM system_admins WHERE id = ${sa.id}`,
    )
    expect(rows.length).toBe(1)
  })

  it('system_admin_self: super admin NO ve fila de otro super admin', async () => {
    const sql = getSql()
    const sa1 = await createTestSystemAdmin(sql)
    const sa2 = await createTestSystemAdmin(sql)
    const rows = await withContext(
      { role: 'authenticated', systemAdminId: sa1.id },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM system_admins WHERE id = ${sa2.id}`,
    )
    expect(rows.length).toBe(0)
  })

  it('system_admin_self_update: super admin actualiza solo su fila', async () => {
    const sql = getSql()
    const sa1 = await createTestSystemAdmin(sql)
    const sa2 = await createTestSystemAdmin(sql)
    const ok = await withContextRollback(
      { role: 'authenticated', systemAdminId: sa1.id },
      (tx) =>
        tx<{ id: string }[]>`UPDATE system_admins SET first_name='x' WHERE id=${sa1.id} RETURNING id`,
    )
    expect(ok.length).toBe(1)
    const blocked = await withContextRollback(
      { role: 'authenticated', systemAdminId: sa1.id },
      (tx) =>
        tx<{ id: string }[]>`UPDATE system_admins SET first_name='hijack' WHERE id=${sa2.id} RETURNING id`,
    )
    expect(blocked.length).toBe(0)
  })

  it('realtime: claim app_metadata.tenant_id ausente → 0 filas', async () => {
    const rows = await withContext(
      { role: 'authenticated', jwtClaims: { app_metadata: {} } },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
    )
    expect(rows.length).toBe(0)
  })

  it('realtime: claim app_metadata.tenant_id malformado → safe (0 filas o error de cast)', async () => {
    try {
      const rows = await withContext(
        { role: 'authenticated', jwtClaims: { app_metadata: { tenant_id: 'not-a-uuid' } } },
        (tx) =>
          tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
      )
      expect(rows.length).toBe(0)
    } catch (e) {
      expect(String(e)).toMatch(/invalid input syntax for type uuid/i)
    }
  })

  it('realtime: claim sin app_metadata → 0 filas', async () => {
    const rows = await withContext(
      { role: 'authenticated', jwtClaims: { sub: 'whoever' } },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
    )
    expect(rows.length).toBe(0)
  })
})

// ─── K. Positive relational reads (anti-regresión de policies estrictas) ───
// La suite es fuerte en aislamiento (negativos) pero las policies POSITIVAS
// relacionales no se verificaban. Si alguna se rompe o se vuelve demasiado
// estricta, la app deja de mostrar datos legítimos (grilla realtime, PII de
// clientes, reservas del jugador) y NINGÚN test rojo lo delata. Estos cierran
// ese gap: cada uno aísla UNA policy positiva.
describe('K. positive relational reads', () => {
  it('player_own_bookings_select: jugador A ve su propia reserva', async () => {
    const rows = await withContext(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
    )
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(A.bookingId)
  })

  it('realtime_tenant_select: JWT con tenant_id propio ve la reserva (sin SET tenant)', async () => {
    // Sólo el claim del JWT, sin app.current_tenant_id → aísla la policy
    // realtime (contraparte positiva de I.2, que sólo cubre el cross-tenant).
    const rows = await withContext(
      { role: 'authenticated', jwtClaims: { app_metadata: { tenant_id: tenantA.id } } },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
    )
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(A.bookingId)
  })

  it('staff_can_see_related_players: staff A ve PII de un player CON PTR-con-A', async () => {
    // Contraparte positiva de I.4 (que sólo cubre el negativo, player sin PTR).
    const rows = await withContext(
      { role: 'authenticated', tenantId: tenantA.id },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM players WHERE id = ${A.playerId}`,
    )
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(A.playerId)
  })

  it('staff_see_same_tenant_staff: staff A ve a staff del MISMO tenant', async () => {
    // Contraparte positiva de I.3 (que sólo cubre el negativo cross-tenant).
    const rows = await withContext(
      { role: 'authenticated', tenantId: tenantA.id },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM staff_users WHERE id = ${A.staffUserId}`,
    )
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(A.staffUserId)
  })

  it('player_own_relationships_select: jugador A ve su propia relación con el tenant', async () => {
    const rows = await withContext(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM player_tenant_relationships WHERE id = ${A.ptrId}`,
    )
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(A.ptrId)
  })
})

// ─── L. Tablas RLS post-021 (TG-P0-RLS-01 / TG-BL-01) ──────────────
// 4 tablas ganaron RLS después de 006 y NO estaban en la suite bloqueante: si se
// dropeaba su policy, ningún test rojo lo delataba. Se cubren según su modelo:
//   * push_subscriptions / player_favorites — aislamiento clásico → fail-safe
//     count=0 (bloque H, arriba) + cross-tenant/cross-player + smoke positivo acá.
//   * feature_flags / reviews — lectura global/pública por diseño → fail-safe de
//     ESCRITURA: el rol de app no puede mutar (no hay write policy / falta contexto).
describe('L. tablas RLS post-021', () => {
  it('push_subscriptions: tenant B no ve la suscripción de A (cross-tenant SELECT)', async () => {
    const rows = await withContext(
      { role: 'authenticated', tenantId: tenantB.id },
      (tx) => tx<{ id: string }[]>`SELECT id FROM push_subscriptions WHERE id = ${pushSubA}`,
    )
    expect(rows.length).toBe(0)
  })

  it('push_subscriptions: tenant A SÍ ve su suscripción (smoke positivo)', async () => {
    const rows = await withContext(
      { role: 'authenticated', tenantId: tenantA.id },
      (tx) => tx<{ id: string }[]>`SELECT id FROM push_subscriptions WHERE id = ${pushSubA}`,
    )
    expect(rows.length).toBe(1)
  })

  it('player_favorites: otro jugador no ve el favorito de A (cross-player SELECT)', async () => {
    const rows = await withContext(
      { role: 'authenticated', playerId: B.playerId },
      (tx) => tx<{ id: string }[]>`SELECT id FROM player_favorites WHERE id = ${favA}`,
    )
    expect(rows.length).toBe(0)
  })

  it('player_favorites: el jugador A SÍ ve su favorito (smoke positivo)', async () => {
    const rows = await withContext(
      { role: 'authenticated', playerId: A.playerId },
      (tx) => tx<{ id: string }[]>`SELECT id FROM player_favorites WHERE id = ${favA}`,
    )
    expect(rows.length).toBe(1)
  })

  it('feature_flags: rol de app NO puede INSERT un override (sin write policy)', async () => {
    // RLS default-deny: feature_flags sólo tiene policy de SELECT. Un tenant no
    // puede crear overrides (ej. flipear su propio kill switch `suspended`).
    await expect(
      withContextRollback({ role: 'authenticated', tenantId: tenantA.id }, (tx) =>
        tx`INSERT INTO feature_flags (key, value, tenant_id)
           VALUES (${`spoof_flag_${tenantA.id}`}, true, ${tenantA.id})`,
      ),
    ).rejects.toThrow(/row-level security policy for table "feature_flags"/i)
  })

  it('feature_flags: rol de app NO puede UPDATE un flag global (0 filas)', async () => {
    const rows = await withContextRollback(
      { role: 'authenticated', tenantId: tenantA.id },
      (tx) =>
        tx<{ id: string }[]>`
          UPDATE feature_flags SET value = NOT value
          WHERE key = 'online_booking' AND tenant_id IS NULL
          RETURNING id`,
    )
    expect(rows.length).toBe(0)
  })

  it('reviews: sin player context, INSERT rechazado por RLS', async () => {
    // reviews tiene lectura PÚBLICA (USING true) pero INSERT sólo del jugador
    // dueño del booking. Sin app.current_player_id, la WITH CHECK falla.
    await expect(
      withContextRollback({ role: 'authenticated', tenantId: tenantA.id }, (tx) =>
        tx`INSERT INTO reviews (tenant_id, player_id, booking_id, rating)
           VALUES (${tenantA.id}, ${A.playerId}, ${A.bookingId}, 5)`,
      ),
    ).rejects.toThrow(/row-level security policy for table "reviews"/i)
  })
})

// ─── M. Invariante de schema: toda tabla con RLS tiene FORCE (TG-BL-02) ───
// Cierra el gap que dejó 021 (ver 036_force_rls_remaining_tables.sql): sin FORCE,
// el owner de la tabla bypassa las policies. Este test va ROJO si alguien agrega
// una tabla con ENABLE ROW LEVEL SECURITY pero se olvida del FORCE.
describe('M. schema invariant: FORCE ROW LEVEL SECURITY', () => {
  it('toda tabla public con relrowsecurity también tiene relforcerowsecurity', async () => {
    const sql = getSql()
    const rows = await sql<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND NOT c.relforcerowsecurity
      ORDER BY c.relname
    `
    // toEqual([]) en vez de length===0 para que el mensaje de falla liste las
    // tablas ofensoras (ej. ['nueva_tabla']).
    expect(rows.map((r) => r.relname)).toEqual([])
  })
})
