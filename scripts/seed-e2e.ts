import { config } from 'dotenv'
// Standalone scripts don't get Next.js's automatic .env.local loading.
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { E2E_TEST_PASSWORD } from '../tests/e2e/_helpers/test-credentials'
import { deleteFreshAdminTenants } from '../tests/e2e/_helpers/fresh-tenant-cleanup'

// This script builds fixtures across MULTIPLE tenants/players in one flat
// pass (unlike the app itself, which always scopes a request to one
// tenant/player via withTenantContext/withPlayerContext) and deletes from
// audit_logs/daily_cash_closes, which 008_revokes.sql intentionally locks
// down for turnogol_app (audit immutability) — the running app must never
// delete those rows, but resetting E2E fixtures between runs needs to. So,
// like a migration, it connects with the well-known local/CI Postgres
// superuser (same default CI's postgres:15-alpine service and local
// Supabase both use on :54322 — see .github/workflows/ci.yml) instead of
// DATABASE_URL/getSql() — production code never takes this path.
const SEED_ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

const E2E = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  tenantSlug: 'e2e-complejo-demo',
  tenantName: 'E2E Complejo Demo',
  city: 'Buenos Aires',
  adminEmail: 'e2e-admin@turnogol.test',
  adminAuthUserId: '00000000-0000-4000-8000-000000000002',
  staffUserId: '00000000-0000-4000-8000-000000000003',
  courtId: '00000000-0000-4000-8000-000000000010',
  playerEmail: 'e2e-player@turnogol.test',
  playerId: '00000000-0000-4000-8000-000000000020',
  playerAuthUserId: '00000000-0000-4000-8000-000000000021',
  freshAdminEmail: 'e2e-admin-fresh@turnogol.test',
  freshAdminAuthUserId: '00000000-0000-4000-8000-000000000004',
  freshStaffUserId: '00000000-0000-4000-8000-000000000005',
  secondAdminEmail: 'e2e-admin-2@turnogol.test',
  secondAdminAuthUserId: '00000000-0000-4000-8000-000000000006',
  secondStaffUserId: '00000000-0000-4000-8000-000000000007',
  depositTenantId: '00000000-0000-4000-8000-000000000030',
  depositTenantSlug: 'e2e-complejo-sena',
  depositTenantName: 'E2E Complejo Seña',
  depositCourtId: '00000000-0000-4000-8000-000000000031',
}

type SqlClient = ReturnType<typeof postgres>

/**
 * Reverse-FK deletion order. We do NOT rely on ON DELETE CASCADE because
 * different envs may have NO ACTION on some FKs, and explicit ordering
 * surfaces seed mistakes immediately.
 */
async function cleanup(sql: SqlClient): Promise<void> {
  // enforce_booking_invariants only fires BEFORE UPDATE (005_triggers.sql),
  // not DELETE — so deleting bookings outright (instead of nulling
  // payment_id first) never touches terminal-state bookings through it.
  // Deleting bookings before payments also satisfies the FK (bookings.
  // payment_id -> payments.id, NO ACTION): once the referencing booking row
  // is gone, the payment row it pointed to can be deleted freely.

  // Cascade-delete any tenants the freshAdmin created during prior E2E runs.
  // El barrido vive en tests/e2e/_helpers/fresh-tenant-cleanup.ts porque los specs que
  // completan el wizard del fresh admin también tienen que correrlo en su afterAll: el
  // seed corre UNA sola vez (global setup) y no protege de la contaminación que ocurre
  // durante la corrida.
  await deleteFreshAdminTenants(sql, E2E.freshStaffUserId)
  await sql`DELETE FROM audit_logs WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM notifications WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM cash_flows WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM daily_cash_closes WHERE tenant_id = ${E2E.tenantId}`
  await sql`UPDATE payments SET booking_id = NULL WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM bookings WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM payments WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenant_player_bans WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM abonados WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM products WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM courts WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM player_tenant_relationships WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenant_staff_members WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenant_subscriptions WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenants WHERE id = ${E2E.tenantId}`
  await sql`DELETE FROM audit_logs WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM notifications WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM cash_flows WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM daily_cash_closes WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`UPDATE payments SET booking_id = NULL WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM bookings WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM payments WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM tenant_player_bans WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM abonados WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM products WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM courts WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM player_tenant_relationships WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM tenant_staff_members WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM tenant_subscriptions WHERE tenant_id = ${E2E.depositTenantId}`
  await sql`DELETE FROM tenants WHERE id = ${E2E.depositTenantId}`
  await sql`DELETE FROM players WHERE id = ${E2E.playerId} OR email = ${E2E.playerEmail}`
  await sql`DELETE FROM staff_users WHERE id = ${E2E.staffUserId} OR email = ${E2E.adminEmail}`
  await sql`DELETE FROM staff_users WHERE id = ${E2E.freshStaffUserId} OR email = ${E2E.freshAdminEmail}`
  await sql`DELETE FROM staff_users WHERE id = ${E2E.secondStaffUserId} OR email = ${E2E.secondAdminEmail}`
}

async function cleanupAuthUsers(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  for (const id of [E2E.adminAuthUserId, E2E.playerAuthUserId, E2E.freshAdminAuthUserId, E2E.secondAdminAuthUserId]) {
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error && !/not found/i.test(error.message)) {
      throw error
    }
  }
}

async function seedTenantAndCourt(sql: SqlClient): Promise<void> {
  // Single all-day rule so calculatePrice never returns null for E2E slots.
  // Amounts in centavos: 100 ARS/hr = 10000 centavos.
  const pricing = {
    rules: [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        from: '00:00',
        // NOTE: '23:59' (not '00:00'). public.service.getPriceForSlot does NOT
        // treat to=0 as 24h, so '00:00' would return null price for every slot.
        // (booking.service.priceForDuration DOES; helper inconsistency tracked.)
        to: '23:59',
        price: 10000,
      },
    ],
  }
  const openingHours = {
    mon: { open: '08:00', close: '23:00' },
    tue: { open: '08:00', close: '23:00' },
    wed: { open: '08:00', close: '23:00' },
    thu: { open: '08:00', close: '23:00' },
    fri: { open: '08:00', close: '23:00' },
    sat: { open: '09:00', close: '23:00' },
    sun: { open: '09:00', close: '23:00' },
  }
  // requires_deposit:false → online bookings confirm immediately (no MP needed in E2E).
  const settings = {
    requires_deposit: false,
    deposit_percentage: 0,
    cancellation_policy: { hours_before: 12, penalty_type: 'deposit', penalty_amount: null },
    no_show_penalty: { type: 'none', days: 0 },
    accepts_cash: true,
    accepts_transfer: true,
    accepts_mercadopago: true,
    allow_online_booking: true,
    booking_advance_days: 6,
    auto_complete_minutes: 30,
    onboarding_completed: true,
    // Sin esto el DashboardTour (3 coachmarks de primera visita) se monta en
    // TODOS los specs e2e admin que aterrizan en /dashboard, tapando botones
    // con el portal y rompiendo clicks que no lo esperan.
    admin_tour_seen_at: new Date().toISOString(),
  }
  await sql`
    INSERT INTO tenants (
      id, slug, name, address, city, province, phone, email, status,
      opening_hours, settings
    ) VALUES (
      ${E2E.tenantId}, ${E2E.tenantSlug}, ${E2E.tenantName},
      ${'Av. Siempreviva 742'}, ${E2E.city}, ${'Buenos Aires'},
      ${'+541100000000'}, ${'e2e-tenant@turnogol.test'}, 'active',
      ${sql.json(openingHours)}, ${sql.json(settings)}
    )
  `
  await sql`
    INSERT INTO courts (id, tenant_id, name, capacity, status, pricing)
    VALUES (${E2E.courtId}, ${E2E.tenantId}, ${'Cancha E2E 1'}, 10, 'online', ${sql.json(pricing)})
  `
}

async function seedDepositTenantAndCourt(sql: SqlClient): Promise<void> {
  // Same pricing + opening hours as the demo tenant.
  const pricing = {
    rules: [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        from: '00:00',
        // Match demo tenant: '23:59' so public.service.getPriceForSlot matches.
        to: '23:59',
        price: 10000,
      },
    ],
  }
  const openingHours = {
    mon: { open: '08:00', close: '23:00' },
    tue: { open: '08:00', close: '23:00' },
    wed: { open: '08:00', close: '23:00' },
    thu: { open: '08:00', close: '23:00' },
    fri: { open: '08:00', close: '23:00' },
    sat: { open: '09:00', close: '23:00' },
    sun: { open: '09:00', close: '23:00' },
  }
  // requires_deposit:true → online bookings require MP deposit before confirmation.
  const settings = {
    requires_deposit: true,
    deposit_percentage: 50,
    cancellation_policy: { hours_before: 12, penalty_type: 'deposit', penalty_amount: null },
    no_show_penalty: { type: 'none', days: 0 },
    accepts_cash: true,
    accepts_transfer: true,
    accepts_mercadopago: true,
    allow_online_booking: true,
    booking_advance_days: 6,
    auto_complete_minutes: 30,
    onboarding_completed: true,
    admin_tour_seen_at: new Date().toISOString(),
  }
  await sql`
    INSERT INTO tenants (
      id, slug, name, address, city, province, phone, email, status,
      opening_hours, settings, mp_access_token
    ) VALUES (
      ${E2E.depositTenantId}, ${E2E.depositTenantSlug}, ${E2E.depositTenantName},
      ${'Av. Siempreviva 743'}, ${'Buenos Aires'}, ${'Buenos Aires'},
      ${'+541100000001'}, ${'e2e-tenant-sena@turnogol.test'}, 'active',
      ${sql.json(openingHours)}, ${sql.json(settings)}, ${'mock-mp-token'}
    )
  `
  await sql`
    INSERT INTO courts (id, tenant_id, name, capacity, status, pricing)
    VALUES (${E2E.depositCourtId}, ${E2E.depositTenantId}, ${'Cancha Seña 1'}, 10, 'online', ${sql.json(pricing)})
  `
}

async function seedStaffAndPlayer(sql: SqlClient): Promise<void> {
  await sql`
    INSERT INTO staff_users (id, email, first_name, last_name)
    VALUES (${E2E.staffUserId}, ${E2E.adminEmail}, ${'E2E'}, ${'Admin'})
  `
  await sql`
    INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role)
    VALUES (${E2E.tenantId}, ${E2E.staffUserId}, 'admin')
  `
  await sql`
    INSERT INTO staff_users (id, email, first_name, last_name)
    VALUES (${E2E.secondStaffUserId}, ${E2E.secondAdminEmail}, ${'E2E'}, ${'Admin2'})
  `
  await sql`
    INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role)
    VALUES (${E2E.tenantId}, ${E2E.secondStaffUserId}, 'admin')
  `
  await sql`
    INSERT INTO players (id, email, first_name, last_name, status, agreed_to_terms_at, terms_version)
    VALUES (${E2E.playerId}, ${E2E.playerEmail}, ${'E2E'}, ${'Player'}, 'active', NOW(), 'v1')
  `
  await sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id)
    VALUES (${E2E.tenantId}, ${E2E.playerId})
  `
  await sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id)
    VALUES (${E2E.depositTenantId}, ${E2E.playerId})
  `
}

async function seedFreshAdminStaff(sql: SqlClient): Promise<void> {
  await sql`
    INSERT INTO staff_users (id, email, first_name, last_name)
    VALUES (${E2E.freshStaffUserId}, ${E2E.freshAdminEmail}, ${'Fresh'}, ${'Admin'})
  `
  // NO tenant_staff_members insert — fresh admin has 0 tenants → enters wizard.
}

async function seedAuthUsers(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // Admin auth user
  {
    const { error } = await supabase.auth.admin.createUser({
      id: E2E.adminAuthUserId,
      email: E2E.adminEmail,
      email_confirm: true,
      // Staff ahora entra por email+password (spec auth migration). Password fijo
      // de test, gateado por NODE_ENV en test-credentials.
      password: E2E_TEST_PASSWORD,
      // extractAuthUser reads staff_user_id + tenant_id from app_metadata.
      app_metadata: {
        tenant_id: E2E.tenantId,
        role: 'admin',
        staff_user_id: E2E.staffUserId,
      },
    })
    if (error) throw error
  }
  // Player auth user
  {
    const { error } = await supabase.auth.admin.createUser({
      id: E2E.playerAuthUserId,
      email: E2E.playerEmail,
      email_confirm: true,
      // extractAuthUser classifies as player via is_player flag.
      app_metadata: { is_player: true, player_id: E2E.playerId },
    })
    if (error) throw error
  }
  // Fresh admin auth user (no tenant — for onboarding wizard E2E)
  {
    const { error } = await supabase.auth.admin.createUser({
      id: E2E.freshAdminAuthUserId,
      email: E2E.freshAdminEmail,
      email_confirm: true,
      password: E2E_TEST_PASSWORD,
      // 0-tenant admin: callback sets only staff_user_id; wizard creates tenant.
      app_metadata: { staff_user_id: E2E.freshStaffUserId },
    })
    if (error) throw error
  }
  // Second admin auth user — same tenant as admin 1, for realtime multi-user E2E
  {
    const { error } = await supabase.auth.admin.createUser({
      id: E2E.secondAdminAuthUserId,
      email: E2E.secondAdminEmail,
      email_confirm: true,
      password: E2E_TEST_PASSWORD,
      app_metadata: {
        tenant_id: E2E.tenantId,
        role: 'admin',
        staff_user_id: E2E.secondStaffUserId,
      },
    })
    if (error) throw error
  }
}

async function main(): Promise<void> {
  const sql = postgres(SEED_ADMIN_URL, { max: 1, prepare: false, onnotice: () => {} })
  try {
    await cleanupAuthUsers()
    await cleanup(sql)
    await seedTenantAndCourt(sql)
    await seedDepositTenantAndCourt(sql)
    await seedStaffAndPlayer(sql)
    await seedFreshAdminStaff(sql)
    await seedAuthUsers()
    console.log('E2E seed OK')
    console.log(`  tenant: ${E2E.tenantId} (${E2E.tenantSlug})`)
    console.log(`  depositTenant: ${E2E.depositTenantId} (${E2E.depositTenantSlug})`)
    console.log(`  admin:  ${E2E.adminEmail} (auth ${E2E.adminAuthUserId})`)
    console.log(`  player: ${E2E.playerEmail} (auth ${E2E.playerAuthUserId})`)
    console.log(`  freshAdmin: ${E2E.freshAdminEmail} (auth ${E2E.freshAdminAuthUserId})`)
    console.log(`  admin2: ${E2E.secondAdminEmail} (auth ${E2E.secondAdminAuthUserId})`)
  } finally {
    await sql.end()
  }
}

main().catch((e) => {
  console.error('E2E seed failed:', e)
  process.exit(1)
})
