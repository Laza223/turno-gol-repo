import { faker } from '@faker-js/faker'
import type { Sql, TransactionSql } from 'postgres'
import { withContextRollback } from '@/shared/db/client'
import { adminSql } from './admin-db'

/**
 * Corre `fn` con el ROL DE LA APLICACIÓN (`turnogol_app`) y el contexto de
 * tenant seteado: lo que esta transacción no ve, producción tampoco.
 *
 * Es la contracara de `adminSql()` (ver `./admin-db.ts`): los seeds necesitan
 * privilegios, los ASSERTS necesitan las restricciones. Un `SELECT` de
 * post-condición hecho con `adminSql()`/`getSql()` corre como superusuario y
 * por lo tanto NO prueba que la app pueda leer esa fila — ahí es donde se
 * escondieron los bugs de RLS que llegaron a producción con la suite en verde.
 *
 * Siempre hace ROLLBACK, así que también es seguro para asserts que escriben.
 *
 * Excepciones legítimas que se quedan en `adminSql()` (documentar el motivo en
 * cada caso): lecturas deliberadamente cross-tenant, tablas globales de
 * infraestructura (`processed_webhooks`, pg-boss) y tablas deny-all para el rol
 * de la app (`push_send_log`).
 */
export function asApp<T>(tenantId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  // Montado sobre `getSql()` A PROPÓSITO (withContextRollback usa ese pool): es
  // el pool cuyo DSN puede endurecerse más adelante. Hoy ya ejercita
  // `SET LOCAL ROLE` + RLS + GRANTs, que es el 90% de la clase de bugs.
  return withContextRollback({ role: 'turnogol_app', tenantId }, fn)
}

export async function ensureRoles(sql?: Sql): Promise<void> {
  const s = sql ?? adminSql()
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
  //
  // turnogol_worker (migr. 038) va en el mismo saco por PARIDAD LOCAL/CI: en CI
  // `postgres` es superusuario real y asume cualquier rol sin membresía, pero en
  // Supabase local NO lo es (rolsuper=f) y el SET LOCAL ROLE explota con
  // "permission denied to set role". Sin este grant, retention-age-purges.test.ts
  // (§grants del rol worker, migr. 057) pasa en CI y falla localmente. El IF
  // EXISTS cubre el orden: el rol nace en una migración, no acá.
  await s.unsafe(`
    GRANT turnogol_app TO postgres;
    GRANT authenticated TO postgres;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_worker') THEN
        GRANT turnogol_worker TO postgres;
      END IF;
    END $$;
  `)
  // Grant privileges so RLS (not GRANT) is what blocks.
  await s.unsafe(`
    GRANT USAGE ON SCHEMA public TO authenticated, turnogol_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO turnogol_app;
  `)
  // Re-apply REVOKE because GRANT ALL above re-granted UPDATE/DELETE on inmutable tables.
  // Migración 048 (rediseño Caja y Cantina) sumó 3 tablas al mismo patrón append-only/
  // soft-delete: sin este re-apply, isolation.test.ts bloque N (REVOKE) da falso verde
  // localmente — el rol turnogol_app recupera DELETE/UPDATE apenas corre CUALQUIER test
  // de integración, porque el GRANT ALL de arriba corre en cada beforeAll.
  await s.unsafe(`
    REVOKE UPDATE, DELETE ON audit_logs FROM turnogol_app;
    REVOKE UPDATE, DELETE ON daily_cash_closes FROM turnogol_app;
    REVOKE UPDATE, DELETE ON stock_movements FROM turnogol_app;
    REVOKE DELETE ON canteen_products FROM turnogol_app;
    REVOKE DELETE ON canteen_tabs FROM turnogol_app;
    REVOKE DELETE ON daily_cash_opens FROM turnogol_app;
    REVOKE UPDATE ON tournament_match_events FROM turnogol_app;
    REVOKE UPDATE ON analytics_events FROM turnogol_app;
  `)
  // push_send_log (migr. 059, F3): deny-all para turnogol_app — el GRANT ALL
  // de arriba también le re-otorga SELECT/INSERT/UPDATE/DELETE (a diferencia
  // de las tablas de arriba, acá NO queda ningún permiso, ni siquiera
  // SELECT/INSERT). Sin este re-apply, isolation.test.ts bloque P da falso
  // verde localmente por el mismo motivo que el comentario de arriba.
  await s.unsafe(`
    REVOKE ALL ON push_send_log FROM turnogol_app;
  `)
}

export type TestTenant = { id: string; slug: string; name: string }

export async function createTestTenant(
  sql?: Sql,
  overrides: Partial<{ slug: string; name: string }> = {},
): Promise<TestTenant> {
  const s = sql ?? adminSql()
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
  const s = sql ?? adminSql()
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
  const s = sql ?? adminSql()
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
  const s = sql ?? adminSql()
  const email =
    overrides.email ?? `sa-${Date.now()}-${faker.string.alphanumeric(6).toLowerCase()}@test.local`
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
  role: 'admin' | 'manager' = 'admin',
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
  const s = sql ?? adminSql()
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
      tenant_subscriptions,
      tenant_player_bans,
      player_tenant_relationships,
      tenant_staff_members,
      courts,
      processed_webhooks,
      push_send_log,
      tenants,
      system_admins,
      staff_users,
      players
    RESTART IDENTITY CASCADE;
  `)
}
