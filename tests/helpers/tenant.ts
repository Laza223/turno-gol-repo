import { faker } from '@faker-js/faker'
import type { Sql } from 'postgres'
import { getSql } from '@/shared/db/client'

export async function ensureRoles(sql?: Sql): Promise<void> {
  const s = sql ?? getSql()
  // Create turnogol_app role if absent (008_revokes.sql depends on it).
  await s.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_app') THEN
        CREATE ROLE turnogol_app NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END $$;
  `)
  // Grant membership so the test superuser (postgres) can SET LOCAL ROLE turnogol_app
  // inside tests that need to exercise RLS policies as the app role.
  await s.unsafe(`
    GRANT turnogol_app TO postgres;
    GRANT authenticated TO postgres;
  `)
  // Grant privileges so RLS (not GRANT) is what blocks.
  await s.unsafe(`
    GRANT USAGE ON SCHEMA public TO authenticated, turnogol_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO turnogol_app;
  `)
  // Re-apply REVOKE because GRANT ALL above re-granted UPDATE/DELETE on inmutable tables.
  await s.unsafe(`
    REVOKE UPDATE, DELETE ON audit_logs FROM turnogol_app;
    REVOKE UPDATE, DELETE ON daily_cash_closes FROM turnogol_app;
  `)
}

export type TestTenant = { id: string; slug: string; name: string }

export async function createTestTenant(
  sql?: Sql,
  overrides: Partial<{ slug: string; name: string }> = {},
): Promise<TestTenant> {
  const s = sql ?? getSql()
  const slug = overrides.slug ?? `t-${faker.string.alphanumeric(10).toLowerCase()}`
  const name = overrides.name ?? faker.company.name().slice(0, 50)
  const rows = await s<{ id: string; slug: string; name: string }[]>`
    INSERT INTO tenants (slug, name, address, city, province, phone, email)
    VALUES (
      ${slug},
      ${name},
      ${faker.location.streetAddress()},
      ${faker.location.city()},
      ${'Buenos Aires'},
      ${faker.phone.number()},
      ${faker.internet.email().toLowerCase()}
    )
    RETURNING id, slug, name
  `
  return rows[0]
}

export type TestPlayer = { id: string; email: string }

export async function createTestPlayer(
  sql?: Sql,
  overrides: Partial<{ email: string }> = {},
): Promise<TestPlayer> {
  const s = sql ?? getSql()
  const email = overrides.email ?? faker.internet.email({ provider: 'test.local' }).toLowerCase()
  const rows = await s<{ id: string; email: string }[]>`
    INSERT INTO players (email, first_name, last_name, agreed_to_terms_at, terms_version)
    VALUES (
      ${email},
      ${faker.person.firstName()},
      ${faker.person.lastName()},
      NOW(),
      ${'v1'}
    )
    RETURNING id, email
  `
  return rows[0]
}

export type TestStaff = { id: string; email: string }

export async function createTestStaffUser(
  sql?: Sql,
  overrides: Partial<{ email: string }> = {},
): Promise<TestStaff> {
  const s = sql ?? getSql()
  const email = overrides.email ?? faker.internet.email({ provider: 'staff.local' }).toLowerCase()
  const rows = await s<{ id: string; email: string }[]>`
    INSERT INTO staff_users (email, first_name, last_name)
    VALUES (
      ${email},
      ${faker.person.firstName()},
      ${faker.person.lastName()}
    )
    RETURNING id, email
  `
  return rows[0]
}

export type TestSystemAdmin = { id: string; email: string }

export async function createTestSystemAdmin(
  sql?: Sql,
  overrides: Partial<{ email: string }> = {},
): Promise<TestSystemAdmin> {
  const s = sql ?? getSql()
  const email = overrides.email
    ?? `sa-${Date.now()}-${faker.string.alphanumeric(6).toLowerCase()}@test.local`
  const rows = await s<{ id: string; email: string }[]>`
    INSERT INTO system_admins (email, first_name, last_name)
    VALUES (
      ${email},
      ${faker.person.firstName()},
      ${faker.person.lastName()}
    )
    RETURNING id, email
  `
  return rows[0]
}

export async function linkStaffToTenant(
  sql: Sql,
  tenantId: string,
  staffUserId: string,
  role: 'admin' | 'manager' | 'read_only' = 'admin',
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role, is_active)
    VALUES (${tenantId}, ${staffUserId}, ${role}, true)
    RETURNING id
  `
  return rows[0].id
}

export async function linkPlayerToTenant(
  sql: Sql,
  tenantId: string,
  playerId: string,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO player_tenant_relationships (tenant_id, player_id)
    VALUES (${tenantId}, ${playerId})
    RETURNING id
  `
  return rows[0].id
}

export async function cleanupAll(sql?: Sql): Promise<void> {
  const s = sql ?? getSql()
  // Order respects FKs. Staff and players cleared last (referenced by many).
  await s.unsafe(`
    TRUNCATE TABLE
      audit_logs,
      notifications,
      daily_cash_closes,
      cash_flows,
      payments,
      bookings,
      abonados,
      products,
      tenant_subscriptions,
      tenant_player_bans,
      player_tenant_relationships,
      tenant_staff_members,
      courts,
      processed_webhooks,
      tenants,
      system_admins,
      staff_users,
      players
    RESTART IDENTITY CASCADE;
  `)
}
